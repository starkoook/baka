import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findSimilarImages,
  hammingDistance,
  perceptualHash,
  removeBackground,
  replaceTransparentBackground,
  scanBadImages,
} from '../image-tools.js'

const tempDirs: string[] = []

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baka-image-tools-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
})

async function createImage(filePath: string, options: { width?: number; height?: number; background?: string; center?: string } = {}) {
  const width = options.width || 64
  const height = options.height || 64
  const background = options.background || '#ffffff'
  let image = sharp({ create: { width, height, channels: 3, background } })
  if (options.center) {
    const center = Buffer.from(
      `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${background}"/><rect x="${Math.round(width * 0.25)}" y="${Math.round(height * 0.25)}" width="${Math.round(width * 0.5)}" height="${Math.round(height * 0.5)}" fill="${options.center}"/></svg>`
    )
    image = sharp(center)
  }
  await image.png().toFile(filePath)
}

describe('image tools', () => {
  it('removes a solid border background', async () => {
    const dir = tempDir()
    const input = path.join(dir, 'input.png')
    const output = path.join(dir, 'output.png')
    await createImage(input, { width: 64, height: 64, background: '#ffffff', center: '#ff0000' })

    await removeBackground(input, { tolerance: 20, feather: 0, outputPath: output })
    const meta = await sharp(output).metadata()
    expect(meta.hasAlpha).toBe(true)

    const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const channels = info.channels || 4
    const cornerAlpha = data[3]
    const centerAlpha = data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * channels + 3]
    expect(cornerAlpha).toBe(0)
    expect(centerAlpha).toBe(255)
  })

  it('replaces transparent pixels with a color', async () => {
    const dir = tempDir()
    const input = path.join(dir, 'input.png')
    const output = path.join(dir, 'output.png')
    await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(input)

    await replaceTransparentBackground(input, { color: '#336699', outputPath: output })
    const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([data[0], data[1], data[2]]).toEqual([51, 102, 153])
  })

  it('finds identical and similar images', async () => {
    const dir = tempDir()
    const a = path.join(dir, 'a.png')
    const b = path.join(dir, 'b.png')
    const c = path.join(dir, 'c.png')
    await createImage(a, { width: 64, height: 64, background: '#ffffff', center: '#ff0000' })
    await createImage(b, { width: 64, height: 64, background: '#ffffff', center: '#ff0000' })
    await createImage(c, { width: 64, height: 64, background: '#000000', center: '#00ffff' })

    const hashA = await perceptualHash(a)
    const hashB = await perceptualHash(b)
    expect(hammingDistance(hashA, hashB)).toBe(0)
    const result = await findSimilarImages([a, b, c], { threshold: 8 })
    expect(result.groups.length).toBe(1)
    expect(result.groups[0].map((item) => path.basename(item.path))).toEqual(['a.png', 'b.png'])
  })

  it('flags unreadable and low resolution images', async () => {
    const dir = tempDir()
    const broken = path.join(dir, 'broken.png')
    const tiny = path.join(dir, 'tiny.png')
    fs.writeFileSync(broken, 'not an image')
    await createImage(tiny, { width: 2, height: 2, background: '#ffffff' })

    const results = await scanBadImages([broken, tiny])
    expect(results.find((item) => item.path === broken)?.status).toBe('bad')
    expect(results.find((item) => item.path === tiny)?.status).toBe('bad')
  })
})

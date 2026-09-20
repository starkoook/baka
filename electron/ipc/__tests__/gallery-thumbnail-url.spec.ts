import { mkdtempSync, existsSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// 让 paths.js 把数据根目录指到临时文件夹，测试不会碰真实图库。
const dataRoot = mkdtempSync(join(tmpdir(), 'baka-thumb-'))
process.env.BAKA_DATA_ROOT = dataRoot

let gallery: typeof import('../gallery.js')
let sharp: typeof import('sharp')

beforeAll(async () => {
  gallery = await import('../gallery.js')
  sharp = (await import('sharp')).default
})

afterAll(() => {
  rmSync(dataRoot, { recursive: true, force: true })
  delete process.env.BAKA_DATA_ROOT
})

describe('gallery thumbnails over media://', () => {
  it('creates the thumbnail file once and returns a path instead of base64', async () => {
    const source = join(dataRoot, 'source image 图.png')
    await sharp({ create: { width: 900, height: 600, channels: 3, background: '#ff7eb6' } }).png().toFile(source)

    const first = await gallery.ensureThumbnailPath(source)
    expect(existsSync(first.thumbPath)).toBe(true)
    expect(first.thumbPath.startsWith(join(dataRoot, 'thumbnails'))).toBe(true)
    const meta = await sharp(first.thumbPath).metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(384)

    const mtime = statSync(first.thumbPath).mtimeMs
    const second = await gallery.ensureThumbnailPath(source)
    expect(second.thumbPath).toBe(first.thumbPath)
    expect(statSync(second.thumbPath).mtimeMs).toBe(mtime)
  })

  it('formats media urls the same way the workbench already does', () => {
    expect(gallery.toMediaUrl('D:\\baka\\图库\\a b.jpg')).toBe('media:///D:/baka/%E5%9B%BE%E5%BA%93/a%20b.jpg')
  })
})

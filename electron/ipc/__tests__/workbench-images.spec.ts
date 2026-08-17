import { mkdtempSync, openSync, closeSync, ftruncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { inspectWorkbenchImage } from '../workbench-images.js'

describe('inspectWorkbenchImage', () => {
  it('returns a data URL, dimensions, and normalized metadata', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'baka-image-')), 'plain.png')
    await sharp({ create: { width: 8, height: 6, channels: 4, background: '#ff66aa' } }).png().toFile(file)

    const result = await inspectWorkbenchImage(file)

    expect(result.success).toBe(true)
    expect(result.image).toMatchObject({ filePath: file, mimeType: 'image/png', width: 8, height: 6 })
    expect(result.image.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(result.image.metadata).toEqual({ hasMetadata: false })
  })

  it('rejects unsupported files', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'baka-image-')), 'note.txt')
    writeFileSync(file, 'nope')

    expect(await inspectWorkbenchImage(file)).toMatchObject({ success: false, error: '不支持的图片格式' })
  })

  it('rejects oversized images before reading them into IPC memory', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'baka-image-')), 'huge.png')
    const descriptor = openSync(file, 'w')
    ftruncateSync(descriptor, 101 * 1024 * 1024)
    closeSync(descriptor)
    await expect(inspectWorkbenchImage(file)).resolves.toMatchObject({ success: false, error: '图片超过 100 MB，无法加载' })
  })
})

import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { moveImages } from '../move-images-safe.js'

describe('moveImagesSafe', () => {
  it('returns failures without losing the first moved file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-move-'))
    const src1 = join(dir, 'a.png')
    const src2 = join(dir, 'b.png')
    writeFileSync(src1, 'a')
    writeFileSync(src2, 'b')
    const dest = join(dir, 'out')

    const result = await moveImages({
      filePaths: [src1, src2],
      destFolder: dest,
      keepOriginal: false,
      failAt: src2,
    })

    expect(result.success).toBe(false)
    expect(result.data.failures).toHaveLength(1)
    expect(existsSync(join(dest, 'a.png'))).toBe(true)
    expect(existsSync(src1)).toBe(false)
  })
})

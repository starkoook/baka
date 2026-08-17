import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('recycle bin', () => {
  it('moves a file out and restores it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-recycle-'))
    process.env.BAKA_DATA_ROOT = dir
    const { moveToRecycle, restoreRecycleItem } = await import('../recycle-bin.js')
    const target = join(dir, 'image.png')
    writeFileSync(target, 'kept')

    const moved = await moveToRecycle(target)
    expect(moved.success).toBe(true)
    expect(existsSync(target)).toBe(false)

    const restored = await restoreRecycleItem(moved.id)
    expect(restored.success).toBe(true)
    expect(readFileSync(restored.restoredPath, 'utf8')).toBe('kept')
  })
})

import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('file history', () => {
  it('keeps a version and restores it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-history-'))
    process.env.BAKA_DATA_ROOT = dir
    const { createHistoryRecord, restoreVersion } = await import('../file-history.js')
    const target = join(dir, 'caption.txt')
    writeFileSync(target, 'v1', 'utf8')
    const record = await createHistoryRecord(target, join(dir, 'history'))
    writeFileSync(target, 'v2', 'utf8')

    const restored = await restoreVersion(record.id)

    expect(restored.success).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('v1')
  })
})

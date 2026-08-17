import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeTextSafe } from '../safe-file.js'

describe('safe-file', () => {
  it('replaces an existing file without truncating it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-safe-'))
    const target = join(dir, 'caption.txt')
    writeFileSync(target, 'old', 'utf8')

    const result = await writeTextSafe(target, 'new')

    expect(result).toMatchObject({ success: true })
    expect(readFileSync(target, 'utf8')).toBe('new')
  })
})

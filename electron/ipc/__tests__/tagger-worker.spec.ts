import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'electron/ipc/tagger-worker.js'), 'utf8')

describe('tagger worker preprocessing', () => {
  it('decodes images to raw pixels before padding', () => {
    expect(source).toContain('.raw()')
    expect(source).toContain('.removeAlpha()')
    expect(source).not.toContain('sharp(data, { raw:')
  })
})

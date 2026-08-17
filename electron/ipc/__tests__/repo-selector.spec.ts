import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { selectTrainerRepo } = require('../../runtime/repo-selector.js') as {
  selectTrainerRepo: (configured: string, candidates: string[]) => string
}

const tempRoots: string[] = []

function makeDirectory(name: string, valid: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'baka-repo-selector-'))
  tempRoots.push(root)
  const directory = join(root, name)
  mkdirSync(directory)
  if (valid) writeFileSync(join(directory, 'gui.py'), '# trainer entrypoint\n', 'utf8')
  return directory
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('trainer repository selector', () => {
  it('keeps a valid user-configured repository first', () => {
    const configured = makeDirectory('configured', true)
    const reference = makeDirectory('reference', true)

    expect(selectTrainerRepo(configured, [reference])).toBe(configured)
  })

  it('uses the local reference before later fallbacks', () => {
    const reference = makeDirectory('reference', true)
    const bundled = makeDirectory('bundled', true)

    expect(selectTrainerRepo('', [reference, bundled])).toBe(reference)
  })

  it('skips paths that are not trainer repositories', () => {
    const invalid = makeDirectory('invalid', false)
    const downloaded = makeDirectory('downloaded', true)

    expect(selectTrainerRepo(invalid, [invalid, downloaded])).toBe(downloaded)
  })
})

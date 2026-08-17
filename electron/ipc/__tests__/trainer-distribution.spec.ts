import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  ensureBundledTrainer,
  getInstalledTrainer,
  readTrainerVersion,
  rollbackTrainer,
} = require('../../runtime/trainer-distribution.js') as {
  ensureBundledTrainer: (options: { bundledRoot: string; dataRoot: string }) => { path: string; version: string; installed: boolean }
  getInstalledTrainer: (dataRoot: string) => { path: string; version: string } | null
  readTrainerVersion: (repoRoot: string) => string
  rollbackTrainer: (dataRoot: string) => { path: string; version: string } | null
}

const roots: string[] = []

function makeRoot(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

function makeTrainer(root: string, version: string) {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'gui.py'), '# trainer\n', 'utf8')
  writeFileSync(join(root, 'version.json'), JSON.stringify({ version }), 'utf8')
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('trainer distribution', () => {
  it('installs the packaged trainer into versioned user data', () => {
    const bundledRoot = makeRoot('baka-bundled-trainer-')
    const dataRoot = makeRoot('baka-trainer-data-')
    makeTrainer(bundledRoot, 'v1.6.2')

    const result = ensureBundledTrainer({ bundledRoot, dataRoot })

    expect(result).toMatchObject({ version: 'v1.6.2', installed: true })
    expect(readFileSync(join(result.path, 'gui.py'), 'utf8')).toContain('trainer')
    expect(getInstalledTrainer(dataRoot)).toEqual({ path: result.path, version: 'v1.6.2' })
  })

  it('keeps the previous trainer available for rollback', () => {
    const dataRoot = makeRoot('baka-trainer-rollback-')
    const firstBundle = makeRoot('baka-trainer-v1-')
    const secondBundle = makeRoot('baka-trainer-v2-')
    makeTrainer(firstBundle, 'v1.6.1')
    makeTrainer(secondBundle, 'v1.6.2')

    ensureBundledTrainer({ bundledRoot: firstBundle, dataRoot })
    ensureBundledTrainer({ bundledRoot: secondBundle, dataRoot })

    expect(getInstalledTrainer(dataRoot)?.version).toBe('v1.6.2')
    expect(rollbackTrainer(dataRoot)?.version).toBe('v1.6.1')
    expect(getInstalledTrainer(dataRoot)?.version).toBe('v1.6.1')
  })

  it('uses a stable fallback version when version.json is missing', () => {
    const trainer = makeRoot('baka-unversioned-trainer-')
    writeFileSync(join(trainer, 'gui.py'), '# trainer\n', 'utf8')

    expect(readTrainerVersion(trainer)).toBe('unversioned')
  })

  it('reads the active-version state written by the online component installer', () => {
    const dataRoot = makeRoot('baka-managed-trainer-')
    const trainer = join(dataRoot, 'trainer', 'versions', 'v2')
    makeTrainer(trainer, 'v2')
    writeFileSync(join(dataRoot, 'trainer', 'active.json'), JSON.stringify({ activeVersion: 'v2', previousVersion: 'v1' }))

    expect(getInstalledTrainer(dataRoot)).toEqual({ path: trainer, version: 'v2' })
  })
})

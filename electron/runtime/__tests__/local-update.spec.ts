import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const {
  compareVersions,
  inspectLocalUpdate,
  recordVersions,
  verifyArtifact,
} = require(resolve(process.cwd(), 'electron/runtime/local-update.js'))

describe('local update foundation', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0')).toBe(0)
  })

  it('finds and verifies a compatible local installer', () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-update-'))
    const installer = join(root, 'Baka-TOOLS-Setup.exe')
    writeFileSync(installer, 'local installer fixture')
    const crypto = require('node:crypto')
    const sha256 = crypto.createHash('sha256').update(readFileSync(installer)).digest('hex')
    const manifestPath = join(root, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify({
      formatVersion: 1,
      versions: { baka: '0.2.0', trainer: '1.6.2', schema: '1.6.2', runtime: '2026.07' },
      compatibility: { minimumBaka: '0.1.0' },
      artifact: { file: 'Baka-TOOLS-Setup.exe', sha256 },
    }))

    const result = inspectLocalUpdate(manifestPath, { baka: '0.1.0' })
    expect(result.available).toBe(true)
    expect(result.compatible).toBe(true)
    expect(verifyArtifact(result.artifact)).toEqual({ ok: true, sha256 })
  })

  it('keeps a four-part version history for rollback diagnostics', () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-version-'))
    recordVersions(root, { baka: '0.1.0', trainer: '1.6.2', schema: 'abc123', runtime: 'standard' })
    recordVersions(root, { baka: '0.2.0', trainer: '1.7.0', schema: 'def456', runtime: 'blackwell' })
    const registry = JSON.parse(readFileSync(join(root, 'version-registry.json'), 'utf8'))

    expect(registry.current).toMatchObject({ baka: '0.2.0', trainer: '1.7.0', schema: 'def456', runtime: 'blackwell' })
    expect(registry.history).toHaveLength(1)
    expect(registry.history[0].baka).toBe('0.1.0')
  })
})

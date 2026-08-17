import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'

const { compareVersions, parseManifest, satisfiesRange, selectInstallSet } = require(resolve('electron/components/manifest.js'))

describe('training component manifest', () => {
  const fixture = {
    formatVersion: 1,
    channel: 'local-test',
    components: {
      trainer: { version: 'v1.6.2', file: 'trainer-v1.6.2.zip', size: 10, sha256: 'a'.repeat(64), minimumBaka: '0.2.0' },
      'runtime-standard': { version: 'torch2.10-cu128-v1', file: 'runtime-standard.zip', size: 20, sha256: 'b'.repeat(64), trainerRange: '>=v1.6.2 <v2.0.0' },
    },
  }

  it('accepts a valid versioned manifest and keeps component ids', () => {
    const parsed = parseManifest(fixture)
    expect(parsed.channel).toBe('local-test')
    expect(parsed.components.trainer.id).toBe('trainer')
  })

  it('rejects traversal and invalid hashes', () => {
    const badPath = { ...fixture, components: { trainer: { ...fixture.components.trainer, file: '../trainer.zip' } } }
    const badHash = { ...fixture, components: { trainer: { ...fixture.components.trainer, sha256: 'bad' } } }
    expect(() => parseManifest(badPath)).toThrow('越界')
    expect(() => parseManifest(badHash)).toThrow('SHA-256')
  })

  it('rejects a version that could escape the version directory', () => {
    const badVersion = { ...fixture, components: { trainer: { ...fixture.components.trainer, version: '../../outside' } } }
    expect(() => parseManifest(badVersion)).toThrow('版本号')
  })

  it('checks Baka and trainer compatibility before selecting downloads', () => {
    const parsed = parseManifest(fixture)
    expect(selectInstallSet(parsed, 'standard', '0.2.0').map((item: any) => item.id)).toEqual(['trainer', 'runtime-standard'])
    expect(() => selectInstallSet(parsed, 'standard', '0.1.0')).toThrow('Baka')
  })

  it('compares v-prefixed versions and simple ranges', () => {
    expect(compareVersions('v1.10.0', 'v1.9.9')).toBeGreaterThan(0)
    expect(satisfiesRange('v1.6.2', '>=v1.6.0 <v2.0.0')).toBe(true)
    expect(satisfiesRange('v2.0.0', '>=v1.6.0 <v2.0.0')).toBe(false)
  })
})

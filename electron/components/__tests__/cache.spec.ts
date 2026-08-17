// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const { exportComponentCache, importComponentCache } = require(resolve('electron/components/cache.js'))

describe('portable component cache', () => {
  it('exports and imports only verified selected packages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-cache-'))
    const packages = join(root, 'packages')
    const portable = join(root, 'portable')
    const imported = join(root, 'imported')
    mkdirSync(packages)
    const bytes = Buffer.from('trainer archive')
    writeFileSync(join(packages, 'trainer.zip'), bytes)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const manifest = { formatVersion: 1, channel: 'test', components: { trainer: { version: 'v1', file: 'trainer.zip', size: bytes.length, sha256 } } }

    expect(await exportComponentCache({ manifest, componentIds: ['trainer'], packageRoot: packages, destination: portable })).toEqual({ success: true, count: 1 })
    expect(await importComponentCache({ source: portable, packageRoot: imported })).toMatchObject({ success: true, count: 1 })
    expect(readFileSync(join(imported, 'trainer.zip'))).toEqual(bytes)
    expect(JSON.parse(readFileSync(join(imported, 'manifest.json'), 'utf8')).channel).toBe('imported-cache')
  })

  it('rejects a modified portable cache without copying it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-cache-bad-'))
    const imported = join(root, 'imported')
    writeFileSync(join(root, 'trainer.zip'), 'changed')
    writeFileSync(join(root, 'manifest.json'), JSON.stringify({ formatVersion: 1, channel: 'portable-cache', components: { trainer: { version: 'v1', file: 'trainer.zip', size: 7, sha256: 'a'.repeat(64) } } }))

    await expect(importComponentCache({ source: root, packageRoot: imported })).rejects.toThrow('校验失败')
    expect(existsSync(join(imported, 'trainer.zip'))).toBe(false)
  })
})

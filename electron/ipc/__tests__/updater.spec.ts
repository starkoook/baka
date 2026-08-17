import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('updater transport', () => {
  it('uses only a local manifest during the private validation phase', () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/ipc/updater.js'), 'utf8')

    expect(source).toContain('inspectLocalUpdate')
    expect(source).toContain('verifyArtifact')
    expect(source).toContain('BAKA_LOCAL_UPDATE_MANIFEST')
    expect(source).not.toContain('electron-updater')
    expect(source).not.toContain('checkForUpdates')
  })
})

// @vitest-environment node
import AdmZip from 'adm-zip'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const { inspectArchiveEntries, inspectArchiveListing, installArchive } = require(resolve('electron/components/archive.js'))

describe('component archive installation', () => {
  it('rejects a zip entry outside the component root', () => {
    expect(() => inspectArchiveEntries([{ entryName: '../escape.txt', isDirectory: false }])).toThrow('越界')
    expect(() => inspectArchiveEntries([{ entryName: 'C:/escape.txt', isDirectory: false }])).toThrow('越界')
  })

  it('rejects links in the streaming archive listing', () => {
    expect(() => inspectArchiveListing('lrwxrwxrwx  0 user group 0 Jan 1 00:00 link -> C:/outside')).toThrow('链接')
    expect(() => inspectArchiveListing('hrw-r--r--  0 user group 0 Jan 1 00:00 hardlink')).toThrow('链接')
  })

  it('rejects a version path outside the versions root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-version-path-'))
    const archivePath = join(root, 'trainer.zip')
    const zip = new AdmZip()
    zip.addFile('gui.py', Buffer.from('ready'))
    writeFileSync(archivePath, zip.toBuffer())

    await expect(installArchive({ archivePath, versionsRoot: join(root, 'versions'), version: '../../escape', activePath: join(root, 'active.json'), healthCheck: async () => true })).rejects.toThrow('越界')
    expect(existsSync(join(root, 'escape'))).toBe(false)
  })

  it('switches active version only after a successful health check', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-archive-'))
    const archivePath = join(root, 'trainer.zip')
    const zip = new AdmZip()
    zip.addFile('gui.py', Buffer.from('ready'))
    writeFileSync(archivePath, zip.toBuffer())
    expect(new AdmZip(archivePath).readAsText('gui.py')).toBe('ready')
    const activePath = join(root, 'active.json')
    writeFileSync(activePath, JSON.stringify({ activeVersion: 'old' }))

    const result = await installArchive({ archivePath, versionsRoot: join(root, 'versions'), version: 'new', activePath, healthCheck: async folder => existsSync(join(folder, 'gui.py')) })

    expect(result.version).toBe('new')
    expect(readFileSync(join(result.path, 'gui.py'), 'utf8')).toBe('ready')
    expect(JSON.parse(readFileSync(activePath, 'utf8'))).toMatchObject({ activeVersion: 'new', previousVersion: 'old' })
  })

  it('keeps the old version and removes staging when health check fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-archive-fail-'))
    const archivePath = join(root, 'trainer.zip')
    const zip = new AdmZip()
    zip.addFile('gui.py', Buffer.from('broken'))
    writeFileSync(archivePath, zip.toBuffer())
    const activePath = join(root, 'active.json')
    writeFileSync(activePath, JSON.stringify({ activeVersion: 'old' }))
    const existingVersion = join(root, 'versions', 'new')
    writeFileSync(join(root, 'existing.tmp'), 'old')
    mkdirSync(existingVersion, { recursive: true })
    copyFileSync(join(root, 'existing.tmp'), join(existingVersion, 'gui.py'))

    await expect(installArchive({ archivePath, versionsRoot: join(root, 'versions'), version: 'new', activePath, healthCheck: async () => false })).rejects.toThrow('健康检查')

    expect(JSON.parse(readFileSync(activePath, 'utf8')).activeVersion).toBe('old')
    expect(existsSync(join(root, 'versions', 'new.installing'))).toBe(false)
    expect(readFileSync(join(root, 'versions', 'new', 'gui.py'), 'utf8')).toBe('old')
  })
})

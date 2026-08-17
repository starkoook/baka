import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const gallerySource = readFileSync(resolve(process.cwd(), 'electron/ipc/gallery.js'), 'utf8')

describe('gallery rescan persistence', () => {
  it('updates an existing image in place instead of deleting it', () => {
    const scanBlock = gallerySource.match(/async function scanFolder[\s\S]*?\/\/ ── IPC Handler Registration/)?.[0] ?? ''

    expect(scanBlock).not.toContain("runSql('DELETE FROM images WHERE path = ?'")
    expect(scanBlock).toContain('UPDATE images SET')
  })

  it('saves the database once after a scan batch', () => {
    const scanBlock = gallerySource.match(/async function scanFolder[\s\S]*?\/\/ ── IPC Handler Registration/)?.[0] ?? ''

    expect(scanBlock).toContain('db.run(\'BEGIN TRANSACTION\')')
    expect(scanBlock).toContain('db.run(\'COMMIT\')')
  })

  it('does not hide database query failures as empty results', () => {
    const queryHelpers = gallerySource.match(/function queryAll[\s\S]*?function runSql/)?.[0] ?? ''

    expect(queryHelpers).not.toContain('catch')
  })

  it('writes a batch of tags in one transaction', () => {
    const handler = gallerySource.match(/ipcMain\.handle\('gallery:batchSetTags'[\s\S]*?\n  \}\)/)?.[0] ?? ''

    expect(handler).toContain("db.run('BEGIN TRANSACTION')")
    expect(handler).toContain("db.run('COMMIT')")
    expect(handler).toContain('saveDb()')
  })

  it('coordinates reviewed annotation database and caption saves', () => {
    const handler = gallerySource.match(/ipcMain\.handle\('gallery:saveAnnotation'[\s\S]*?\n  \}\)/)?.[0] ?? ''

    expect(gallerySource).toContain("require('./annotation-save')")
    expect(handler).toContain('saveAnnotation(')
    expect(handler).toContain("db.run('BEGIN TRANSACTION')")
    expect(handler).toContain('writeTextSafe')
    expect(handler).toContain('databaseSaved')
    expect(handler).toContain('captionSaved')
  })

  it('updates indexed paths in one transaction after files are moved', () => {
    const handler = gallerySource.match(/ipcMain\.handle\('gallery:updateImagePaths'[\s\S]*?\n  \}\)/)?.[0] ?? ''

    expect(handler).toContain("db.run('BEGIN TRANSACTION')")
    expect(handler).toContain('UPDATE images SET path = ?, filename = ?, dirname = ? WHERE path = ?')
    expect(handler).toContain("db.run('COMMIT')")
    expect(handler).toContain('saveDb()')
  })

  it('classifies dropped paths without scanning unrelated parent folders', () => {
    expect(gallerySource).toContain('function classifyDroppedPaths(paths)')
    expect(gallerySource).toContain('fs.statSync(filePath)')
    expect(gallerySource).toContain('imagePaths')
    expect(gallerySource).toContain('folderPaths')
    expect(gallerySource).toContain('unsupportedCount')
  })

  it('registers explicit dropped-file import handlers', () => {
    expect(gallerySource).toContain("ipcMain.handle('gallery:inspectDroppedPaths'")
    expect(gallerySource).toContain("ipcMain.handle('gallery:importFiles'")
  })

  it('imports only explicit image paths in one transaction', () => {
    const block = gallerySource.match(/async function importImageFiles[\s\S]*?function registerGalleryHandlers/)?.[0] ?? ''

    expect(block).toContain('SELECT id, file_modified_at, sd_metadata FROM images WHERE path = ?')
    expect(block).toContain('generateThumbnail(filePath)')
    expect(block).toContain("db.run('BEGIN TRANSACTION')")
    expect(block).toContain("db.run('COMMIT')")
    expect(block).not.toContain('scanFolder(')
  })

  it('persists LoRA metadata and restores it from the gallery cache', () => {
    expect(gallerySource).toContain('sd_loras TEXT')
    expect(gallerySource).toContain('JSON.stringify(sdMeta.loras || [])')
    expect(gallerySource).toContain('JSON.parse(image.sd_metadata)')
  })

  it('persists the complete metadata object and reparses legacy cache rows once', () => {
    expect(gallerySource).toContain('sd_metadata TEXT')
    expect(gallerySource).toContain('JSON.stringify(sdMeta)')
    expect(gallerySource).toContain('JSON.parse(image.sd_metadata)')
    expect(gallerySource).toContain('existing.sd_metadata !== null')
  })

  it('creates file version and recycle item tables at schema version 5', () => {
    expect(gallerySource).toContain('CREATE TABLE IF NOT EXISTS file_versions')
    expect(gallerySource).toContain('CREATE INDEX IF NOT EXISTS idx_file_versions_target')
    expect(gallerySource).toContain('CREATE TABLE IF NOT EXISTS recycle_items')
    expect(gallerySource).toContain('CREATE INDEX IF NOT EXISTS idx_recycle_original')
    expect(gallerySource).toContain('CREATE INDEX IF NOT EXISTS idx_recycle_deleted')
    expect(gallerySource).toContain("runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (5)')")
  })
})

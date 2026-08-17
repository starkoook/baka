const fs = require('fs')
const path = require('path')
const { getHistoryDir } = require('./paths')
const { ensureDb, runSql, queryAll } = require('./gallery')

function targetKey(target) {
  return Buffer.from(path.resolve(target)).toString('hex')
}

async function createHistoryRecord(target, rootOverride = null) {
  await ensureDb()
  if (!fs.existsSync(target)) return { success: true, id: null }
  const root = rootOverride || getHistoryDir()
  const key = targetKey(target)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const versionPath = path.join(root, `${key}-${stamp}-${Math.random().toString(16).slice(2)}`)
  fs.mkdirSync(root, { recursive: true })
  fs.copyFileSync(target, versionPath)
  const createdAt = new Date().toISOString()
  runSql(
    'INSERT INTO file_versions (target_path, version_path, created_at) VALUES (?, ?, ?)',
    [path.resolve(target), versionPath, createdAt]
  )
  const rows = queryAll('SELECT id, version_path FROM file_versions WHERE target_path = ? ORDER BY created_at DESC', [path.resolve(target)])
  for (const row of rows.slice(10)) {
    try { fs.rmSync(row.version_path, { force: true }) } catch {}
    runSql('DELETE FROM file_versions WHERE id = ?', [row.id])
  }
  const row = queryAll('SELECT id FROM file_versions ORDER BY id DESC LIMIT 1')[0]
  return { success: true, id: row ? row.id : null, versionPath, createdAt }
}

async function listVersions(target) {
  await ensureDb()
  return queryAll(
    'SELECT id, version_path, created_at FROM file_versions WHERE target_path = ? ORDER BY created_at DESC',
    [path.resolve(target)]
  )
}

async function restoreVersion(id) {
  await ensureDb()
  const rows = queryAll('SELECT * FROM file_versions WHERE id = ?', [id])
  const row = rows[0]
  if (!row || !fs.existsSync(row.version_path)) return { success: false, error: 'Version not found' }
  await createHistoryRecord(row.target_path)
  fs.copyFileSync(row.version_path, row.target_path)
  return { success: true, targetPath: row.target_path }
}

module.exports = { createHistoryRecord, listVersions, restoreVersion }

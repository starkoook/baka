const fs = require('fs')
const path = require('path')
const { getRecycleDir } = require('./paths')
const { ensureDb, runSql, queryAll } = require('./gallery')

function uniqueRecyclePath(originalPath) {
  const root = getRecycleDir()
  const name = path.basename(originalPath)
  return path.join(root, `${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`)
}

async function moveToRecycle(originalPath) {
  await ensureDb()
  if (!fs.existsSync(originalPath)) return { success: false, error: 'File not found' }
  const recyclePath = uniqueRecyclePath(originalPath)
  fs.mkdirSync(path.dirname(recyclePath), { recursive: true })
  fs.copyFileSync(originalPath, recyclePath)
  const stat = fs.statSync(recyclePath)
  runSql(
    'INSERT INTO recycle_items (original_path, recycle_path, kind, size, deleted_at) VALUES (?, ?, ?, ?, ?)',
    [path.resolve(originalPath), recyclePath, path.extname(originalPath).slice(1), stat.size, new Date().toISOString()]
  )
  fs.rmSync(originalPath, { force: true })
  const row = queryAll('SELECT id FROM recycle_items ORDER BY id DESC LIMIT 1')[0]
  return { success: true, id: row.id, recyclePath }
}

async function restoreRecycleItem(id) {
  await ensureDb()
  const rows = queryAll('SELECT * FROM recycle_items WHERE id = ?', [id])
  const row = rows[0]
  if (!row) return { success: false, error: 'Item not found' }
  if (!fs.existsSync(row.recycle_path)) {
    runSql('DELETE FROM recycle_items WHERE id = ?', [id])
    return { success: false, error: '回收站文件已丢失' }
  }
  try {
    let target = row.original_path
    if (fs.existsSync(target)) {
      const ext = path.extname(target)
      const base = target.slice(0, -ext.length)
      target = `${base}-restored${ext}`
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(row.recycle_path, target)
    fs.rmSync(row.recycle_path, { force: true })
    runSql('DELETE FROM recycle_items WHERE id = ?', [id])
    return { success: true, restoredPath: target }
  } catch (error) {
    return { success: false, error: error.message || String(error) }
  }
}

async function listRecycleItems() {
  await ensureDb()
  return queryAll('SELECT * FROM recycle_items ORDER BY deleted_at DESC')
}

async function purgeExpiredItems(days = 30) {
  await ensureDb()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const items = await listRecycleItems()
  let removed = 0
  for (const item of items) {
    if (Date.parse(item.deleted_at) >= cutoff) continue
    try { fs.rmSync(item.recycle_path, { force: true }) } catch {}
    runSql('DELETE FROM recycle_items WHERE id = ?', [item.id])
    removed++
  }
  return { success: true, removed }
}

module.exports = { moveToRecycle, restoreRecycleItem, listRecycleItems, purgeExpiredItems }

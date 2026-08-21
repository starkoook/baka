/**
 * MCP Tool Handlers — 图库操作
 *
 * 每个函数返回 { content: [{ type: 'text', text: string }] }
 * 直接调用 electron/ipc/gallery.js 导出的数据层函数（不走 IPC）。
 */
const {
  ensureDb, queryAll, queryOne, runSql, saveDb,
  generateThumbnail, readFileMetaFromPath
} = require('../ipc/gallery')

const path = require('path')
const fs = require('fs')

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, data }, null, 2) }] }
}
function fail(msg) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: msg }, null, 2) }] }
}

async function handleAddRoot({ folderPath }) {
  try {
    if (!fs.existsSync(folderPath)) return fail('文件夹不存在: ' + folderPath)
    await ensureDb()
    const label = path.basename(folderPath)
    runSql('INSERT OR IGNORE INTO library_roots (path, label) VALUES (?, ?)', [folderPath, label])
    const row = queryOne('SELECT id FROM library_roots WHERE path = ?', [folderPath])
    saveDb()
    return ok({ id: row ? row.id : 0, path: folderPath })
  } catch (e) { return fail(e.message) }
}

async function handleListRoots() {
  try {
    await ensureDb()
    const roots = queryAll('SELECT * FROM library_roots ORDER BY added_at DESC')
    for (const r of roots) {
      const row = queryOne('SELECT COUNT(*) as count FROM images WHERE root_id = ?', [r.id])
      r.image_count = row ? row.count : 0
    }
    return ok(roots)
  } catch (e) { return fail(e.message) }
}

async function handleRemoveRoot({ rootId, deleteImages }) {
  try {
    await ensureDb()
    if (deleteImages) {
      const imgs = queryAll('SELECT id FROM images WHERE root_id = ?', [rootId])
      for (const img of imgs) {
        runSql('DELETE FROM image_tags WHERE image_id = ?', [img.id])
      }
      runSql('DELETE FROM images WHERE root_id = ?', [rootId])
    } else {
      runSql('UPDATE images SET root_id = NULL WHERE root_id = ?', [rootId])
    }
    runSql('DELETE FROM library_roots WHERE id = ?', [rootId])
    saveDb()
    return ok({ removed: true })
  } catch (e) { return fail(e.message) }
}

async function handleScan({ folderPath }) {
  try {
    await ensureDb()
    const { scanFolder, queryOne, queryAll, runSql } = require('../ipc/gallery')
    let roots
    if (folderPath) {
      const row = queryOne('SELECT * FROM library_roots WHERE path = ?', [folderPath])
      if (!row) {
        runSql('INSERT OR IGNORE INTO library_roots (path, label) VALUES (?, ?)', [folderPath, path.basename(folderPath)])
      }
      roots = queryOne('SELECT * FROM library_roots WHERE path = ?', [folderPath])
      roots = roots ? [roots] : []
    } else {
      roots = queryAll('SELECT * FROM library_roots')
    }
    if (roots.length === 0) return fail('无注册的图库根目录')

    let newCount = 0
    let skipCount = 0
    let errorCount = 0
    let removedCount = 0
    for (const root of roots) {
      if (!fs.existsSync(root.path)) continue
      const res = await scanFolder(root.path, root.id, null)
      newCount += res.newCount
      skipCount += res.skipCount
      errorCount += res.errorCount
      removedCount += res.removedCount || 0
    }
    return ok({ newCount, skipCount, errorCount, removedCount, scanned: roots.length })
  } catch (e) { return fail(e.message) }
}

async function handleListImages({ rootId, sort, order, limit, offset }) {
  try {
    await ensureDb()
    const validSort = { name: 'filename', date: 'file_modified_at', size: 'file_size' }
    const validOrder = { asc: 'ASC', desc: 'DESC' }
    const sortCol = validSort[sort] || 'file_modified_at'
    const orderDir = validOrder[order] || 'DESC'
    const lim = Math.min(limit || 100, 500)
    const off = offset || 0

    let sql = `SELECT * FROM images`
    const params = []
    if (rootId != null) { sql += ' WHERE root_id = ?'; params.push(rootId) }
    sql += ` ORDER BY ${sortCol} ${orderDir} LIMIT ? OFFSET ?`
    params.push(lim, off)

    const images = queryAll(sql, params)
    return ok({ images, count: images.length, limit: lim, offset: off })
  } catch (e) { return fail(e.message) }
}

async function handleGetThumbnail({ imageId }) {
  try {
    await ensureDb()
    const img = queryOne('SELECT * FROM images WHERE id = ?', [imageId])
    if (!img) return fail('图片不存在')
    const thumb = await generateThumbnail(img.path)
    const raw = typeof thumb === 'string' ? thumb : thumb?.base64
    const base64 = raw
      ? (String(raw).startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`)
      : ''
    return ok({ imageId, thumbBase64: base64 })
  } catch (e) { return fail(e.message) }
}

async function handleGetStats() {
  try {
    await ensureDb()
    const total = queryOne('SELECT COUNT(*) as count FROM images')
    const roots = queryOne('SELECT COUNT(*) as count FROM library_roots')
    const sizeRow = queryOne('SELECT SUM(file_size) as total FROM images')
    return ok({
      totalImages: total ? total.count : 0,
      totalRoots: roots ? roots.count : 0,
      totalSize: sizeRow ? sizeRow.total : 0
    })
  } catch (e) { return fail(e.message) }
}

async function handleGetImageTags({ imageId }) {
  try {
    await ensureDb()
    const tags = queryAll(
      `SELECT t.name as tag, t.category, it.confidence, it.source
       FROM image_tags it JOIN tags t ON it.tag_id = t.id
       WHERE it.image_id = ?`, [imageId]
    )
    return ok(tags)
  } catch (e) { return fail(e.message) }
}

async function handleBatchGetTags({ imageIds }) {
  try {
    await ensureDb()
    if (!Array.isArray(imageIds) || imageIds.length === 0) return ok({})
    const placeholders = imageIds.map(() => '?').join(',')
    const rows = queryAll(
      `SELECT it.image_id, t.name as tag, t.category, it.confidence, it.source
       FROM image_tags it JOIN tags t ON it.tag_id = t.id
       WHERE it.image_id IN (${placeholders})`, imageIds
    )
    const result = {}
    for (const r of rows) {
      const id = String(r.image_id)
      if (!result[id]) result[id] = []
      result[id].push({ tag: r.tag, category: r.category, confidence: r.confidence, source: r.source })
    }
    return ok(result)
  } catch (e) { return fail(e.message) }
}

async function handleSetImageTags({ imageId, tags }) {
  try {
    await ensureDb()
    if (!Array.isArray(tags)) return fail('tags 必须是数组')
    runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId])
    for (const t of tags) {
      let tagId
      const existing = queryOne('SELECT id FROM tags WHERE name = ?', [t.tag])
      if (existing) {
        tagId = existing.id
      } else {
        runSql('INSERT INTO tags (name, category) VALUES (?, ?)', [t.tag, t.category || ''])
        const row = queryOne('SELECT last_insert_rowid() as id')
        tagId = row ? row.id : null
      }
      if (tagId != null) {
        runSql('INSERT INTO image_tags (image_id, tag_id, confidence, source) VALUES (?, ?, ?, ?)',
          [imageId, tagId, t.confidence || 0, t.source || 'mcp'])
      }
    }
    saveDb()
    return ok({ imageId, tagCount: tags.length })
  } catch (e) { return fail(e.message) }
}

async function handleBatchSetTags({ entries }) {
  try {
    await ensureDb()
    if (!Array.isArray(entries)) return fail('entries 必须是数组')
    let total = 0
    for (const entry of entries) {
      const { imageId, tags } = entry
      if (!Array.isArray(tags)) continue
      runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId])
      for (const t of tags) {
        let tagId
        const existing = queryOne('SELECT id FROM tags WHERE name = ?', [t.tag])
        if (existing) { tagId = existing.id }
        else {
          runSql('INSERT INTO tags (name, category) VALUES (?, ?)', [t.tag, t.category || ''])
          const row = queryOne('SELECT last_insert_rowid() as id')
          tagId = row ? row.id : null
        }
        if (tagId != null) {
          runSql('INSERT INTO image_tags (image_id, tag_id, confidence, source) VALUES (?, ?, ?, ?)',
            [imageId, tagId, t.confidence || 0, t.source || 'mcp'])
          total++
        }
      }
    }
    saveDb()
    return ok({ updated: entries.length, tagWrites: total })
  } catch (e) { return fail(e.message) }
}

async function handleGetMetadata({ imageId }) {
  try {
    await ensureDb()
    const img = queryOne('SELECT * FROM images WHERE id = ?', [imageId])
    if (!img) return fail('图片不存在')
    const meta = {
      hasMetadata: !!img.sd_has_meta,
      generator: img.sd_generator || null,
      prompt: img.sd_prompt || null,
      negative: img.sd_negative || null,
      steps: img.sd_steps || null,
      sampler: img.sd_sampler || null,
      cfg: img.sd_cfg || null,
      seed: img.sd_seed || null,
      model: img.sd_model || null,
      width: img.width || null,
      height: img.height || null,
    }
    return ok(meta)
  } catch (e) { return fail(e.message) }
}

async function handleReadFileMeta({ filePath }) {
  try {
    if (!fs.existsSync(filePath)) return fail('文件不存在: ' + filePath)
    const meta = await readFileMetaFromPath(filePath)
    return ok(meta)
  } catch (e) { return fail(e.message) }
}

async function handleSaveCaptionFile({ imageId }) {
  try {
    await ensureDb()
    const img = queryOne('SELECT * FROM images WHERE id = ?', [imageId])
    if (!img) return fail('图片不存在')
    const tags = queryAll(
      'SELECT t.name FROM image_tags it JOIN tags t ON it.tag_id = t.id WHERE it.image_id = ?',
      [imageId]
    )
    const caption = tags.map(t => t.name).join(', ')
    const txtPath = img.path.replace(/\.[^.]+$/, '.txt')
    fs.writeFileSync(txtPath, caption, 'utf-8')
    return ok({ path: txtPath, caption })
  } catch (e) { return fail(e.message) }
}

async function handleBatchSaveCaptions({ imageIds }) {
  try {
    await ensureDb()
    let count = 0
    for (const imageId of imageIds) {
      const img = queryOne('SELECT * FROM images WHERE id = ?', [imageId])
      if (!img) continue
      const tags = queryAll(
        'SELECT t.name FROM image_tags it JOIN tags t ON it.tag_id = t.id WHERE it.image_id = ?',
        [imageId]
      )
      const caption = tags.map(t => t.name).join(', ')
      const txtPath = img.path.replace(/\.[^.]+$/, '.txt')
      fs.writeFileSync(txtPath, caption, 'utf-8')
      count++
    }
    return ok({ count })
  } catch (e) { return fail(e.message) }
}

module.exports = {
  handleAddRoot, handleListRoots, handleRemoveRoot, handleScan,
  handleListImages, handleGetThumbnail, handleGetStats,
  handleGetImageTags, handleBatchGetTags, handleSetImageTags, handleBatchSetTags,
  handleGetMetadata, handleReadFileMeta,
  handleSaveCaptionFile, handleBatchSaveCaptions,
}

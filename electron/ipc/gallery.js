const { ipcMain, app } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { getDbPath, getThumbDir } = require('./paths')
const { saveAnnotation } = require('./annotation-save')
const { writeTextSafe } = require('./safe-file')
const { serializeWeightedCaption } = require('./tag-weight')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])
const DROPPED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])

let db = null
let SQL = null
let dbRoot = undefined

function saveDb(root = undefined) {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  const activeRoot = root !== undefined ? root : dbRoot
  const dbPath = getDbPath(activeRoot)
  // Failsafe: ensure parent dir exists
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(dbPath, buffer)
}

async function initDb(root = undefined) {
  if (db) return db
  dbRoot = root
  const initSqlJs = require('sql.js')
  SQL = await initSqlJs()

  const dbPath = getDbPath(dbRoot)
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS library_roots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      dirname TEXT NOT NULL,
      root_id INTEGER,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      file_modified_at TEXT,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      thumb_hash TEXT,
      sd_prompt TEXT,
      sd_negative TEXT,
      sd_steps INTEGER,
      sd_cfg REAL,
      sd_sampler TEXT,
      sd_seed INTEGER,
      sd_model TEXT,
      sd_generator TEXT,
      sd_loras TEXT,
      sd_metadata TEXT,
      sd_has_meta INTEGER DEFAULT 0
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_images_path ON images(path)')
  db.run('CREATE INDEX IF NOT EXISTS idx_images_root ON images(root_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_images_dirname ON images(dirname)')

  // Tags tables
  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'general'
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS image_tags (
      image_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      confidence REAL,
      source TEXT NOT NULL DEFAULT 'unknown',
      PRIMARY KEY (image_id, tag_id)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_image_tags_image ON image_tags(image_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag_id)')

  // ── Schema version for migrations ──
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  const currentVersion = queryOne('SELECT MAX(version) as v FROM schema_version')
  const version = currentVersion ? (currentVersion.v || 0) : 0

  // v1: Tagger model registry & vocabulary (tagger v2)
  if (version < 1) {
    db.run(`
      CREATE TABLE IF NOT EXISTS tagger_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        csv_path TEXT,
        resolution INTEGER DEFAULT 448,
        quality TEXT DEFAULT 'medium',
        speed TEXT DEFAULT 'normal',
        memory_mb INTEGER DEFAULT 2048,
        provider TEXT DEFAULT 'cpu',
        last_used_at TEXT
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS tag_vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL DEFAULT 'general',
        post_count INTEGER DEFAULT 0,
        is_deprecated INTEGER DEFAULT 0
      )
    `)
    db.run('CREATE INDEX IF NOT EXISTS idx_vocab_name ON tag_vocabulary(name)')
    db.run('CREATE INDEX IF NOT EXISTS idx_vocab_category ON tag_vocabulary(category)')

    db.run(`
      CREATE TABLE IF NOT EXISTS tag_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_order INTEGER DEFAULT 0,
        color TEXT
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS tag_category_map (
        tag_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (tag_id, category_id)
      )
    `)

    runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (1)')
  }

  // v2: Add SD metadata columns to images table
  if (version < 2) {
    const cols = ['sd_prompt TEXT', 'sd_negative TEXT', 'sd_steps INTEGER', 'sd_cfg REAL',
      'sd_sampler TEXT', 'sd_seed INTEGER', 'sd_model TEXT', 'sd_generator TEXT', 'sd_has_meta INTEGER DEFAULT 0']
    for (const col of cols) {
      try { db.run(`ALTER TABLE images ADD COLUMN ${col}`) } catch (_) {}
    }
    runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (2)')
  }

  // v3: Preserve LoRA names and weights in the gallery metadata cache.
  if (version < 3) {
    try { db.run('ALTER TABLE images ADD COLUMN sd_loras TEXT') } catch (_) {}
    runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (3)')
  }

  // v4: Preserve the complete parsed and raw generation metadata.
  if (version < 4) {
    try { db.run('ALTER TABLE images ADD COLUMN sd_metadata TEXT') } catch (_) {}
    runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (4)')
  }

  // v5: File version history and app recycle bin.
  if (version < 5) {
    db.run(`
      CREATE TABLE IF NOT EXISTS file_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_path TEXT NOT NULL,
        version_path TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    db.run('CREATE INDEX IF NOT EXISTS idx_file_versions_target ON file_versions(target_path)')
    db.run(`
      CREATE TABLE IF NOT EXISTS recycle_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_path TEXT NOT NULL,
        recycle_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        size INTEGER,
        deleted_at TEXT NOT NULL
      )
    `)
    db.run('CREATE INDEX IF NOT EXISTS idx_recycle_original ON recycle_items(original_path)')
    db.run('CREATE INDEX IF NOT EXISTS idx_recycle_deleted ON recycle_items(deleted_at)')
    runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (5)')
  }

  // v6: Preserve per-tag caption weights such as (tag:1.2) / [tag:0.8].
  if (version < 6) {
    try { db.run('ALTER TABLE image_tags ADD COLUMN weight REAL NOT NULL DEFAULT 1') } catch (_) {}
    runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (6)')
  }

  saveDb(dbRoot)
  return db
}

// ── Query helpers ──

function queryAll(sql, params = []) {
  const results = []
  const stmt = db.prepare(sql)
  try {
    if (params.length > 0) stmt.bind(params)
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    return results
  } finally {
    stmt.free()
  }
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql)
  try {
    if (params.length > 0) stmt.bind(params)
    return stmt.step() ? stmt.getAsObject() : null
  } finally {
    stmt.free()
  }
}

function runSql(sql, params = [], persist = true) {
  db.run(sql, params)
  if (persist) saveDb()
}

// ── Thumbnail generation ──

function hashPath(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex')
}

async function generateThumbnail(imagePath) {
  const sharp = require('sharp')
  const hash = hashPath(imagePath)
  const thumbPath = path.join(getThumbDir(), hash + '.jpg')

  if (fs.existsSync(thumbPath)) {
    return { base64: fs.readFileSync(thumbPath).toString('base64'), hash }
  }

  const buffer = await sharp(imagePath)
    .resize(384, 384, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer()

  fs.writeFileSync(thumbPath, buffer)
  return { base64: buffer.toString('base64'), hash }
}

// ── Scan engine ──

async function scanFolder(folderPath, rootId, mainWindow) {
  console.log('[scanFolder] START folderPath=', folderPath, 'rootId=', rootId)
  const sharp = require('sharp')
  const { parseMetadata } = require('./metadata')

  const entries = []
  function walk(dir) {
    let dirents
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true })
    } catch (_) {
      return
    }
    for (const d of dirents) {
      const full = path.join(dir, d.name)
      if (d.isDirectory()) {
        walk(full)
      } else if (IMAGE_EXTENSIONS.has(path.extname(d.name).toLowerCase())) {
        try {
          const stat = fs.statSync(full)
          entries.push({
            path: full,
            filename: d.name,
            dirname: dir,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          })
        } catch (_) {}
      }
    }
  }

  walk(folderPath)
  console.log('[scanFolder] walk done, entries=', entries.length)

  // Build set of current disk paths
  const diskPaths = new Set(entries.map(e => e.path))

  const total = entries.length
  let current = 0
  let newCount = 0
  let skipCount = 0
  let errorCount = 0
  let removedCount = 0

  db.run('BEGIN TRANSACTION')
  try {
    // Remove records only when the file is really gone.
    const dbRows = queryAll('SELECT id, path, thumb_hash FROM images WHERE root_id = ?', [rootId])
    for (const row of dbRows) {
      if (!diskPaths.has(row.path)) {
        if (row.thumb_hash) {
          try { fs.unlinkSync(path.join(getThumbDir(), row.thumb_hash + '.jpg')) } catch (_) {}
        }
        runSql('DELETE FROM image_tags WHERE image_id = ?', [row.id], false)
        runSql('DELETE FROM images WHERE id = ?', [row.id], false)
        removedCount++
      }
    }

    const BATCH = 5
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH)
      for (const e of batch) {
        try {
          const existing = queryOne('SELECT id, file_modified_at, sd_metadata FROM images WHERE path = ?', [e.path])
          if (existing && existing.file_modified_at === e.mtime && existing.sd_metadata !== null) {
            skipCount++
            current++
            continue
          }

          const { hash } = await generateThumbnail(e.path)
          const imgMeta = await sharp(e.path).metadata()

          let sdMeta = { hasMetadata: false }
          try { sdMeta = parseMetadata(e.path) } catch (_) {}

          const values = [
            e.filename, e.dirname, rootId, imgMeta.width || 0, imgMeta.height || 0, e.size, e.mtime, hash,
            sdMeta.prompt ?? null, sdMeta.negative ?? null, sdMeta.steps ?? null, sdMeta.cfg ?? null,
            sdMeta.sampler ?? null, sdMeta.seed ?? null, sdMeta.model ?? null, sdMeta.generator ?? null,
            JSON.stringify(sdMeta.loras || []),
            JSON.stringify(sdMeta),
            sdMeta.hasMetadata ? 1 : 0,
          ]
          if (existing) {
            runSql(
              `UPDATE images SET filename=?, dirname=?, root_id=?, width=?, height=?, file_size=?, file_modified_at=?,
               indexed_at=datetime('now'), thumb_hash=?, sd_prompt=?, sd_negative=?, sd_steps=?, sd_cfg=?,
               sd_sampler=?, sd_seed=?, sd_model=?, sd_generator=?, sd_loras=?, sd_metadata=?, sd_has_meta=? WHERE id=?`,
              [...values, existing.id],
              false
            )
          } else {
            runSql(
              `INSERT INTO images (filename, dirname, root_id, width, height, file_size, file_modified_at, indexed_at, thumb_hash,
                 sd_prompt, sd_negative, sd_steps, sd_cfg, sd_sampler, sd_seed, sd_model, sd_generator, sd_loras, sd_metadata, sd_has_meta, path)
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [...values, e.path],
              false
            )
          }
          newCount++
        } catch (err) {
          errorCount++
        }
        current++
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gallery:scanProgress', {
          current, total,
          status: `同步中 ${current}/${total}`,
        })
      }
    }
    db.run('COMMIT')
    saveDb()
  } catch (error) {
    try { db.run('ROLLBACK') } catch (_) {}
    throw error
  }

  console.log('[scanFolder] DONE newCount=', newCount, 'skipCount=', skipCount, 'errorCount=', errorCount)
  return { newCount, skipCount, errorCount, removedCount }
}

function classifyDroppedPaths(paths) {
  const imagePaths = []
  const folderPaths = []
  let unsupportedCount = 0

  for (const filePath of [...new Set(Array.isArray(paths) ? paths : [])]) {
    try {
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) folderPaths.push(filePath)
      else if (stat.isFile() && DROPPED_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) imagePaths.push(filePath)
      else unsupportedCount++
    } catch (_) {
      unsupportedCount++
    }
  }

  return { imagePaths, folderPaths, unsupportedCount }
}

async function importImageFiles(filePaths) {
  const sharp = require('sharp')
  const { parseMetadata } = require('./metadata')
  const paths = [...new Set(Array.isArray(filePaths) ? filePaths : [])]
    .filter((filePath) => DROPPED_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
  let importedCount = 0
  let skipCount = 0
  let errorCount = 0

  db.run('BEGIN TRANSACTION')
  try {
    for (const filePath of paths) {
      try {
        const stat = fs.statSync(filePath)
        if (!stat.isFile()) {
          errorCount++
          continue
        }
        const mtime = stat.mtime.toISOString()
        const existing = queryOne('SELECT id, file_modified_at, sd_metadata FROM images WHERE path = ?', [filePath])
        if (existing && existing.file_modified_at === mtime && existing.sd_metadata !== null) {
          skipCount++
          continue
        }

        const { hash } = await generateThumbnail(filePath)
        const imgMeta = await sharp(filePath).metadata()
        let sdMeta = { hasMetadata: false }
        try { sdMeta = parseMetadata(filePath) } catch (_) {}

        const values = [
          path.basename(filePath), path.dirname(filePath), imgMeta.width || 0, imgMeta.height || 0,
          stat.size, mtime, hash, sdMeta.prompt ?? null, sdMeta.negative ?? null,
          sdMeta.steps ?? null, sdMeta.cfg ?? null, sdMeta.sampler ?? null, sdMeta.seed ?? null,
          sdMeta.model ?? null, sdMeta.generator ?? null, JSON.stringify(sdMeta.loras || []), JSON.stringify(sdMeta), sdMeta.hasMetadata ? 1 : 0,
        ]
        if (existing) {
          runSql(
            `UPDATE images SET filename=?, dirname=?, width=?, height=?, file_size=?, file_modified_at=?,
             indexed_at=datetime('now'), thumb_hash=?, sd_prompt=?, sd_negative=?, sd_steps=?, sd_cfg=?,
               sd_sampler=?, sd_seed=?, sd_model=?, sd_generator=?, sd_loras=?, sd_metadata=?, sd_has_meta=? WHERE id=?`,
            [...values, existing.id],
            false
          )
        } else {
          runSql(
            `INSERT INTO images (filename, dirname, root_id, width, height, file_size, file_modified_at, indexed_at,
              thumb_hash, sd_prompt, sd_negative, sd_steps, sd_cfg, sd_sampler, sd_seed, sd_model, sd_generator,
               sd_loras, sd_metadata, sd_has_meta, path) VALUES (?, ?, NULL, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [...values, filePath],
            false
          )
        }
        importedCount++
      } catch (_) {
        errorCount++
      }
    }
    db.run('COMMIT')
    saveDb()
  } catch (error) {
    try { db.run('ROLLBACK') } catch (_) {}
    throw error
  }

  return { importedCount, skipCount, errorCount }
}

// ── IPC Handler Registration ──

// Module-level DB init (shared by IPC handlers and MCP server)
let _ensurePromise = null
function ensureDb() {
  if (!_ensurePromise) _ensurePromise = initDb()
  return _ensurePromise
}

// ── readFileMetaFromPath (shared by IPC and MCP) ──
async function readFileMetaFromPath(filePath) {
  const { parseMetadata } = require('./metadata')
  const sharp = require('sharp')
  const meta = parseMetadata(filePath)
  try {
    const imgMeta = await sharp(filePath).metadata()
    meta.width = imgMeta.width
    meta.height = imgMeta.height
  } catch (_) {}
  try {
    const thumbBuf = await sharp(filePath).resize(384, 384, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
    meta.thumbBase64 = thumbBuf.toString('base64')
  } catch (_) {}
  return meta
}

function registerGalleryHandlers(mainWindow) {
  // Defer init to first handler call so app.getPath('userData') is ready
  // (ensureDb is now module-level, shared with MCP)

  ipcMain.handle('gallery:inspectDroppedPaths', async (_event, paths) => {
    try {
      return { success: true, data: classifyDroppedPaths(paths) }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:importFiles', async (_event, paths) => {
    try {
      await ensureDb()
      return { success: true, data: await importImageFiles(paths) }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:addRoot', async (_event, folderPath) => {
    try {
      console.log('[gallery:addRoot] folderPath=', folderPath)
      await ensureDb()
      const label = path.basename(folderPath)
      runSql('INSERT OR IGNORE INTO library_roots (path, label) VALUES (?, ?)', [folderPath, label])
      const row = queryOne('SELECT id FROM library_roots WHERE path = ?', [folderPath])
      return { success: true, data: { id: row ? row.id : 0 } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:getRoots', async () => {
    try {
      await ensureDb()
      const roots = queryAll('SELECT * FROM library_roots ORDER BY added_at DESC')
      for (const r of roots) {
        const row = queryOne('SELECT COUNT(*) as count FROM images WHERE root_id = ?', [r.id])
        r.image_count = row ? row.count : 0
      }
      return { success: true, data: roots }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:removeRoot', async (_event, { rootId, deleteImages }) => {
    try {
      await ensureDb()
      if (deleteImages) {
        const imgs = queryAll('SELECT thumb_hash FROM images WHERE root_id = ?', [rootId])
        for (const img of imgs) {
          if (img.thumb_hash) {
            const tp = path.join(getThumbDir(), img.thumb_hash + '.jpg')
            try { fs.unlinkSync(tp) } catch (_) {}
          }
        }
        runSql('DELETE FROM images WHERE root_id = ?', [rootId])
      } else {
        runSql('UPDATE images SET root_id = NULL WHERE root_id = ?', [rootId])
      }
      runSql('DELETE FROM library_roots WHERE id = ?', [rootId])
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:scan', async (_event, folderPath) => {
    try {
      console.log('[gallery:scan] START folderPath=', folderPath)
      await ensureDb()
      console.log('[gallery:scan] DB ready')
      let roots = []
      if (folderPath) {
        const root = queryOne('SELECT * FROM library_roots WHERE path = ?', [folderPath])
        if (root) {
          roots = [root]
        } else {
          runSql('INSERT OR IGNORE INTO library_roots (path, label) VALUES (?, ?)', [folderPath, path.basename(folderPath)])
          const r = queryOne('SELECT * FROM library_roots WHERE path = ?', [folderPath])
          if (r) roots = [r]
        }
      } else {
        roots = queryAll('SELECT * FROM library_roots')
      }

      let totalNew = 0
      let totalSkip = 0
      let totalErr = 0
      for (const root of roots) {
        const res = await scanFolder(root.path, root.id, mainWindow)
        totalNew += res.newCount
        totalSkip += res.skipCount
        totalErr += res.errorCount
      }

      return { success: true, data: { newCount: totalNew, skipCount: totalSkip, errorCount: totalErr } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:getImages', async (_event, { rootId, sort, order, limit, offset }) => {
    try {
      await ensureDb()
      const sortCol = sort === 'name' ? 'filename'
        : sort === 'date' ? 'file_modified_at'
        : sort === 'size' ? 'file_size'
        : 'indexed_at'
      const sortOrder = order === 'asc' ? 'ASC' : 'DESC'

      let sql, params
      if (rootId) {
        sql = `SELECT * FROM images WHERE root_id = ? ORDER BY ${sortCol} ${sortOrder}, id ${sortOrder} LIMIT ? OFFSET ?`
        params = [rootId, limit || 100, offset || 0]
      } else {
        sql = `SELECT * FROM images ORDER BY ${sortCol} ${sortOrder}, id ${sortOrder} LIMIT ? OFFSET ?`
        params = [limit || 100, offset || 0]
      }

      const images = queryAll(sql, params)
      return { success: true, data: images }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:getThumbnail', async (_event, imageId) => {
    try {
      await ensureDb()
      const image = queryOne('SELECT * FROM images WHERE id = ?', [imageId])
      if (!image) return { success: false, error: 'Image not found' }

      const { base64 } = await generateThumbnail(image.path)
      return { success: true, data: { base64, thumbHash: image.thumb_hash } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:getStats', async () => {
    try {
      await ensureDb()
      const totalImages = queryOne('SELECT COUNT(*) as count FROM images')
      const totalRoots = queryOne('SELECT COUNT(*) as count FROM library_roots')
      const sizeRow = queryOne('SELECT COALESCE(SUM(file_size), 0) as total FROM images')
      return {
        success: true,
        data: {
          totalImages: totalImages ? totalImages.count : 0,
          totalRoots: totalRoots ? totalRoots.count : 0,
          totalSize: sizeRow ? sizeRow.total : 0,
        },
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  ipcMain.handle('gallery:getImageTags', async (_event, imageId) => {
    try {
      await ensureDb()
      const tags = queryAll(`
        SELECT t.name as tag, t.category, it.confidence, it.source, it.weight
        FROM image_tags it JOIN tags t ON t.id = it.tag_id
        WHERE it.image_id = ?
        ORDER BY it.confidence DESC
      `, [imageId])
      return { success: true, data: tags }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:batchGetTags', async (_event, imageIds) => {
    try {
      await ensureDb()
      if (!imageIds || imageIds.length === 0) return { success: true, data: {} }
      const result = {}
      const placeholders = imageIds.map(() => '?').join(',')
      const rows = queryAll(`
        SELECT it.image_id, t.name as tag, t.category, it.confidence, it.source, it.weight
        FROM image_tags it JOIN tags t ON t.id = it.tag_id
        WHERE it.image_id IN (${placeholders})
        ORDER BY it.confidence DESC
      `, imageIds)
      for (const row of rows) {
        const key = String(row.image_id)
        if (!result[key]) result[key] = []
        result[key].push({ tag: row.tag, category: row.category, confidence: row.confidence, source: row.source, weight: row.weight })
      }
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:setImageTags', async (_event, { imageId, tags }) => {
    try {
      await ensureDb()
      runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId])
      for (const t of tags) {
        runSql('INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)', [t.tag, t.category || 'general'])
        const tagRow = queryOne('SELECT id FROM tags WHERE name = ?', [t.tag])
        if (tagRow) {
          runSql('INSERT OR REPLACE INTO image_tags (image_id, tag_id, confidence, source, weight) VALUES (?, ?, ?, ?, ?)',
            [imageId, tagRow.id, t.confidence || null, t.source || 'unknown', t.weight ?? 1])
        }
      }
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:saveAnnotation', async (_event, request) => {
    await ensureDb()
    const result = await saveAnnotation({
      writeDatabase: async ({ imageId, imagePath, tags }) => {
        const image = queryOne('SELECT id, path FROM images WHERE id = ?', [imageId])
        if (!image) throw new Error('Image not found in gallery')
        if (path.resolve(image.path) !== path.resolve(imagePath)) throw new Error('Image path no longer matches gallery record')

        db.run('BEGIN TRANSACTION')
        try {
          runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId], false)
          for (const tag of tags) {
            runSql('INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)', [tag.tag, tag.category || 'general'], false)
            const tagRow = queryOne('SELECT id FROM tags WHERE name = ?', [tag.tag])
            if (tagRow) {
              runSql(
                'INSERT OR REPLACE INTO image_tags (image_id, tag_id, confidence, source, weight) VALUES (?, ?, ?, ?, ?)',
                [imageId, tagRow.id, tag.confidence ?? null, tag.source || 'manual', tag.weight ?? 1],
                false,
              )
            }
          }
          db.run('COMMIT')
          saveDb()
        } catch (error) {
          try { db.run('ROLLBACK') } catch (_) {}
          throw error
        }
      },
      writeCaption: async ({ imagePath, tags }) => {
        const captionPath = imagePath.replace(/\.[^.]+$/, '') + '.txt'
        await writeTextSafe(captionPath, serializeWeightedCaption(tags))
        return captionPath
      },
    }, request)

    return {
      ...result,
      databaseSaved: result.databaseSaved,
      captionSaved: result.captionSaved,
    }
  })

  ipcMain.handle('gallery:updateImagePaths', async (_event, mappings) => {
    try {
      await ensureDb()
      db.run('BEGIN TRANSACTION')
      let updated = 0
      for (const mapping of mappings || []) {
        const filename = path.basename(mapping.newPath)
        const dirname = path.dirname(mapping.newPath)
        runSql(
          'UPDATE images SET path = ?, filename = ?, dirname = ? WHERE path = ?',
          [mapping.newPath, filename, dirname, mapping.oldPath],
          false,
        )
        updated++
      }
      db.run('COMMIT')
      saveDb()
      return { success: true, data: { updated } }
    } catch (error) {
      try { db.run('ROLLBACK') } catch (_) {}
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('gallery:batchSetTags', async (_event, { entries }) => {
    try {
      await ensureDb()
      let updated = 0
      db.run('BEGIN TRANSACTION')
      for (const { imageId, tags } of entries) {
        if (!tags || tags.length === 0) continue
        runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId], false)
        for (const t of tags) {
          runSql('INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)', [t.tag, t.category || 'general'], false)
          const tagRow = queryOne('SELECT id FROM tags WHERE name = ?', [t.tag])
          if (tagRow) {
            runSql('INSERT OR REPLACE INTO image_tags (image_id, tag_id, confidence, source, weight) VALUES (?, ?, ?, ?, ?)',
              [imageId, tagRow.id, t.confidence || null, t.source || 'unknown', t.weight ?? 1], false)
          }
        }
        updated++
      }
      db.run('COMMIT')
      saveDb()
      return { success: true, data: { updated } }
    } catch (e) {
      try { db.run('ROLLBACK') } catch (_) {}
      return { success: false, error: e.message }
    }
  })
  ipcMain.handle('gallery:getMetadata', async (_event, imageId) => {
    try {
      await ensureDb()
      const image = queryOne('SELECT * FROM images WHERE id = ?', [imageId])
      if (!image) return { success: false, error: 'Image not found' }

      // Return the complete stored metadata when the v4 cache is available.
      if (image.sd_metadata) {
        try {
          const cached = JSON.parse(image.sd_metadata)
          const rawText = cached.rawMetadata ? JSON.stringify(cached.rawMetadata) : ''
          const hasRawLoraSignal = /lora|LoraLoader|LoRALoader|lora_str|temp_lora_str|<lora:/i.test(rawText)
          const cachedHasLoras = Array.isArray(cached.loras) && cached.loras.length > 0
          const hasExtractedMetadata = (
            cached.prompt !== undefined ||
            cached.negative !== undefined ||
            cached.model !== undefined ||
            cached.steps !== undefined ||
            cached.cfg !== undefined ||
            cached.sampler !== undefined ||
            cached.seed !== undefined ||
            cachedHasLoras
          )
          const needsLoraReparse = hasRawLoraSignal && !cachedHasLoras
          if ((hasExtractedMetadata && !needsLoraReparse) || !cached.rawMetadata) {
            return { success: true, data: { ...cached, width: image.width, height: image.height } }
          }
        } catch (_) {
          // Reparse invalid legacy cache below.
        }
      }

      // Fallback: parse fresh and upgrade this row to the complete cache.
      const { parseMetadata } = require('./metadata')
      const meta = parseMetadata(image.path)
      runSql(
        `UPDATE images SET sd_prompt=?, sd_negative=?, sd_steps=?, sd_cfg=?, sd_sampler=?, sd_seed=?, sd_model=?, sd_generator=?, sd_loras=?, sd_metadata=?, sd_has_meta=? WHERE id=?`,
        [meta.prompt ?? null, meta.negative ?? null, meta.steps ?? null, meta.cfg ?? null,
          meta.sampler ?? null, meta.seed ?? null, meta.model ?? null, meta.generator ?? null,
          JSON.stringify(meta.loras || []), JSON.stringify(meta), meta.hasMetadata ? 1 : 0, imageId]
      )
      return { success: true, data: { ...meta, width: image.width, height: image.height } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  ipcMain.handle('gallery:saveCaptionFile', async (_event, imageId) => {
    try {
      await ensureDb()
      const image = queryOne('SELECT * FROM images WHERE id = ?', [imageId])
      if (!image) return { success: false, error: 'Image not found' }

      const tags = queryAll(`
        SELECT t.name, it.weight FROM image_tags it JOIN tags t ON t.id = it.tag_id
        WHERE it.image_id = ? ORDER BY it.confidence DESC
      `, [imageId])
      const caption = serializeWeightedCaption(tags.map((t) => ({ tag: t.name, weight: t.weight })))

      const txtPath = image.path.replace(/\.[^.]+$/, '') + '.txt'
      await writeTextSafe(txtPath, caption)
      return { success: true, data: { path: txtPath, caption } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:batchSaveCaptions', async (_event, imageIds) => {
    try {
      await ensureDb()
      let count = 0
      for (const imageId of imageIds) {
        const image = queryOne('SELECT * FROM images WHERE id = ?', [imageId])
        if (!image) continue
        const tags = queryAll(`
          SELECT t.name, it.weight FROM image_tags it JOIN tags t ON t.id = it.tag_id
          WHERE it.image_id = ? ORDER BY it.confidence DESC
        `, [imageId])
        if (tags.length === 0) continue
        const caption = serializeWeightedCaption(tags.map((t) => ({ tag: t.name, weight: t.weight })))
        const txtPath = image.path.replace(/\.[^.]+$/, '') + '.txt'
        await writeTextSafe(txtPath, caption)
        count++
      }
      return { success: true, data: { count } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('gallery:readFileMeta', async (_event, filePath) => {
    try {
      const meta = await readFileMetaFromPath(filePath)
      return { success: true, data: meta }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerGalleryHandlers, initDb, ensureDb, queryAll, queryOne, runSql, saveDb, generateThumbnail, hashPath, readFileMetaFromPath, classifyDroppedPaths, importImageFiles, IMAGE_EXTENSIONS }

const { ipcMain, app } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { getDbPath, getThumbDir } = require('./paths')
const { saveAnnotation } = require('./annotation-save')
const { writeTextSafe } = require('./safe-file')
const { serializeWeightedCaption } = require('./tag-weight')
const { stampMetadataCache, parseCachedMetadata, galleryCacheNeedsReparse, galleryIndexCacheIsReusable, isModelLoraBlobPrompt } = require('./metadata-cache')

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

  // v7: Invalidate cached model/LoRA blobs stored as the positive prompt so WeiLin XML is reparsed.
  if (version < 7) {
    try {
      db.run(`
        UPDATE images SET sd_metadata = NULL
        WHERE sd_prompt IS NOT NULL
          AND TRIM(sd_prompt) NOT LIKE '<%'
          AND (
            sd_prompt LIKE '%.safetensors%'
            OR sd_prompt LIKE '%.ckpt%'
            OR sd_prompt LIKE '[%'
          )
          AND (
            sd_prompt LIKE '%text_encoder_weight%'
            OR sd_prompt LIKE '%loraWorks%'
            OR sd_prompt LIKE '%lora_str%'
            OR sd_prompt LIKE '%"lora"%'
          )
      `)
    } catch (_) {}
    runSql('INSERT OR REPLACE INTO schema_version (version) VALUES (7)')
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

function persistImageSdMetadata(imageId, meta, persist = true) {
  const stored = { ...meta }
  delete stored.thumbBase64
  runSql(
    `UPDATE images SET sd_prompt=?, sd_negative=?, sd_steps=?, sd_cfg=?, sd_sampler=?, sd_seed=?, sd_model=?, sd_generator=?, sd_loras=?, sd_metadata=?, sd_has_meta=? WHERE id=?`,
    [stored.prompt ?? null, stored.negative ?? null, stored.steps ?? null, stored.cfg ?? null,
      stored.sampler ?? null, stored.seed ?? null, stored.model ?? null, stored.generator ?? null,
      JSON.stringify(stored.loras || []), JSON.stringify(stampMetadataCache(stored)), stored.hasMetadata ? 1 : 0, imageId],
    persist
  )
}

function resolveGalleryPrompt(existingPrompt, meta) {
  if (!meta || typeof meta !== 'object') return meta
  if (isModelLoraBlobPrompt(meta.prompt)) meta.prompt = undefined
  const existingIsBlob = isModelLoraBlobPrompt(existingPrompt)
  const existingIsReal = typeof existingPrompt === 'string' && existingPrompt.trim() && !existingIsBlob
  if (existingIsReal && !(typeof meta.prompt === 'string' && meta.prompt.trim())) {
    meta.prompt = existingPrompt
  }
  return meta
}

function applyParsedMetaToRow(image, meta, persist = true) {
  if (!meta || typeof meta !== 'object') return meta
  const existingPrompt = image && image.sd_prompt
  resolveGalleryPrompt(existingPrompt, meta)
  if (!image || !image.id) return meta
  const existingIsBlob = isModelLoraBlobPrompt(existingPrompt)
  const existingIsReal = typeof existingPrompt === 'string' && existingPrompt.trim() && !existingIsBlob
  const freshIsReal = typeof meta.prompt === 'string' && meta.prompt.trim()
  if (existingIsReal && !freshIsReal) return meta
  if (existingIsReal && !meta.hasMetadata) return meta
  persistImageSdMetadata(image.id, meta, persist)
  return meta
}

/** Reparse rows whose sd_prompt is still a model+LoRA blob. Lazy and cheap; does not rebuild thumbs. */
function repairStaleBlobPromptRows({ limit = 4 } = {}) {
  const { parseMetadata } = require('./metadata')
  const rows = queryAll('SELECT id, path, sd_prompt FROM images')
  const blobs = rows.filter((row) => isModelLoraBlobPrompt(row.sd_prompt))
  let repaired = 0
  for (const row of blobs.slice(0, limit)) {
    try {
      if (!row.path || !fs.existsSync(row.path)) continue
      const meta = parseMetadata(row.path)
      applyParsedMetaToRow(row, meta, false)
      repaired++
    } catch (_) {}
  }
  if (repaired) saveDb()
  return { repaired, remaining: Math.max(0, blobs.length - repaired) }
}

// ── Thumbnail generation ──

function hashPath(filePath) {
  return crypto.createHash('md5').update(filePath).digest('hex')
}

/**
 * 确保缩略图文件存在并返回它的路径。不读文件、不做 base64，
 * 渲染端通过 media:// 协议直接加载，主进程零拷贝。
 */
async function ensureThumbnailPath(imagePath) {
  const hash = hashPath(imagePath)
  const thumbPath = path.join(getThumbDir(), hash + '.jpg')
  if (fs.existsSync(thumbPath)) return { thumbPath, hash }

  const sharp = require('sharp')
  const buffer = await sharp(imagePath)
    .resize(384, 384, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer()
  fs.writeFileSync(thumbPath, buffer)
  return { thumbPath, hash }
}

/** 旧接口：仍返回 base64，供还没迁移到 media:// 的调用方使用。 */
async function generateThumbnail(imagePath) {
  const { thumbPath, hash } = await ensureThumbnailPath(imagePath)
  return { base64: fs.readFileSync(thumbPath).toString('base64'), hash }
}

/** 把本地文件路径转成渲染端可直接用于 <img src> 的 media:// 地址。 */
function toMediaUrl(filePath) {
  return 'media:///' + encodeURI(String(filePath).replace(/\\/g, '/'))
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
          const existing = queryOne('SELECT id, file_modified_at, sd_metadata, sd_prompt FROM images WHERE path = ?', [e.path])
          if (existing && existing.file_modified_at === e.mtime && galleryIndexCacheIsReusable(existing.sd_metadata) && !isModelLoraBlobPrompt(existing.sd_prompt)) {
            skipCount++
            current++
            continue
          }
          if (existing && existing.file_modified_at === e.mtime) {
            // Stale blob caption: reparse metadata only, keep the thumbnail.
            try {
              let sdMeta = { hasMetadata: false }
              try { sdMeta = parseMetadata(e.path) } catch (_) {}
              resolveGalleryPrompt(existing.sd_prompt, sdMeta)
              persistImageSdMetadata(existing.id, sdMeta, false)
              newCount++
            } catch (_) { errorCount++ }
            current++
            continue
          }

          const { hash } = await generateThumbnail(e.path)
          const imgMeta = await sharp(e.path).metadata()

          let sdMeta = { hasMetadata: false }
          try { sdMeta = parseMetadata(e.path) } catch (_) {}
          resolveGalleryPrompt(existing && existing.sd_prompt, sdMeta)

          const values = [
            e.filename, e.dirname, rootId, imgMeta.width || 0, imgMeta.height || 0, e.size, e.mtime, hash,
            sdMeta.prompt ?? null, sdMeta.negative ?? null, sdMeta.steps ?? null, sdMeta.cfg ?? null,
            sdMeta.sampler ?? null, sdMeta.seed ?? null, sdMeta.model ?? null, sdMeta.generator ?? null,
            JSON.stringify(sdMeta.loras || []),
            JSON.stringify(stampMetadataCache(sdMeta)),
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
        const existing = queryOne('SELECT id, file_modified_at, sd_metadata, sd_prompt FROM images WHERE path = ?', [filePath])
        if (existing && existing.file_modified_at === mtime && galleryIndexCacheIsReusable(existing.sd_metadata) && !isModelLoraBlobPrompt(existing.sd_prompt)) {
          skipCount++
          continue
        }
        if (existing && existing.file_modified_at === mtime) {
          try {
            let sdMeta = { hasMetadata: false }
            try { sdMeta = parseMetadata(filePath) } catch (_) {}
            resolveGalleryPrompt(existing.sd_prompt, sdMeta)
            persistImageSdMetadata(existing.id, sdMeta, false)
            importedCount++
          } catch (_) { errorCount++ }
          continue
        }

        const { hash } = await generateThumbnail(filePath)
        const imgMeta = await sharp(filePath).metadata()
        let sdMeta = { hasMetadata: false }
        try { sdMeta = parseMetadata(filePath) } catch (_) {}
        resolveGalleryPrompt(existing && existing.sd_prompt, sdMeta)

        const values = [
          path.basename(filePath), path.dirname(filePath), imgMeta.width || 0, imgMeta.height || 0,
          stat.size, mtime, hash, sdMeta.prompt ?? null, sdMeta.negative ?? null,
          sdMeta.steps ?? null, sdMeta.cfg ?? null, sdMeta.sampler ?? null, sdMeta.seed ?? null,
          sdMeta.model ?? null, sdMeta.generator ?? null, JSON.stringify(sdMeta.loras || []), JSON.stringify(stampMetadataCache(sdMeta)), sdMeta.hasMetadata ? 1 : 0,
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
  try {
    await ensureDb()
    const row = queryOne('SELECT id, path, sd_prompt FROM images WHERE path = ?', [filePath])
    if (row) applyParsedMetaToRow(row, meta)
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

  // 按路径取缩略图（标注队列、数据集等只有路径没有图库 id 的地方用），同一套缓存
  ipcMain.handle('gallery:getThumbnailUrlByPath', async (_event, imagePath) => {
    try {
      if (typeof imagePath !== 'string' || !imagePath) return { success: false, error: 'Invalid path' }
      if (!fs.existsSync(imagePath)) return { success: false, error: 'File not found' }
      const { thumbPath, hash } = await ensureThumbnailPath(imagePath)
      return { success: true, data: { url: toMediaUrl(thumbPath), imageUrl: toMediaUrl(imagePath), thumbHash: hash } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // media:// 版本：只保证缩略图文件存在，返回地址，不经 IPC 搬运图片数据
  ipcMain.handle('gallery:getThumbnailUrl', async (_event, imageId) => {
    try {
      await ensureDb()
      const image = queryOne('SELECT id, path, thumb_hash FROM images WHERE id = ?', [imageId])
      if (!image) return { success: false, error: 'Image not found' }
      const { thumbPath, hash } = await ensureThumbnailPath(image.path)
      return { success: true, data: { url: toMediaUrl(thumbPath), imageUrl: toMediaUrl(image.path), thumbHash: image.thumb_hash || hash } }
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

      // Viewer open: always parse the file so a stale model+LoRA blob cannot hide a real caption.
      const { parseMetadata } = require('./metadata')
      let meta = null
      try {
        if (image.path && fs.existsSync(image.path)) meta = parseMetadata(image.path)
      } catch (_) {}

      if (meta) {
        applyParsedMetaToRow(image, meta)
        return { success: true, data: { ...meta, width: image.width, height: image.height } }
      }

      if (image.sd_metadata) {
        try {
          const cached = parseCachedMetadata(image.sd_metadata)
          if (cached && !galleryCacheNeedsReparse(cached)) {
            return { success: true, data: { ...cached, width: image.width, height: image.height } }
          }
        } catch (_) {}
      }
      return { success: true, data: { hasMetadata: false, width: image.width, height: image.height } }
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

module.exports = { registerGalleryHandlers, initDb, ensureDb, queryAll, queryOne, runSql, saveDb, generateThumbnail, ensureThumbnailPath, toMediaUrl, hashPath, readFileMetaFromPath, classifyDroppedPaths, importImageFiles, persistImageSdMetadata, applyParsedMetaToRow, repairStaleBlobPromptRows, IMAGE_EXTENSIONS }

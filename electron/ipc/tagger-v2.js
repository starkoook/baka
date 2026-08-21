/**
 * Tagger v2 IPC Handler — Orchestrates inference worker and bridges renderer<->worker.
 */
const { ipcMain } = require('electron')
const { fork } = require('child_process')
const path = require('path')
const fs = require('fs')
const { ensureDb, queryAll, runSql } = require('./gallery')
const { writeTextSafe } = require('./safe-file')
const { TagCatalog } = require('./tag-catalog')
const {
  applyTaggingResults,
  deleteTemplate,
  generateTaggingResults,
  getImagePaths,
  getImageTagNames,
  importTemplates,
  listTaggingConfigs,
  loadTemplates,
  resolveTaggingConfigs,
  upsertTemplate,
} = require('./tagging-batch')
const { isVideoFile, extractVideoFrames } = require('./video-frames')

let worker = null
let mainWindow = null
let currentTaskId = null
let activeTask = null
const taggingTasks = new Map()
let catalogPromise = null

function getTagCatalog() {
  if (!catalogPromise) {
    catalogPromise = TagCatalog.load({
      zhPath: path.join(__dirname, '../../resources/tag-data/danbooru-0-zh.csv'),
      characterPath: path.join(__dirname, '../../resources/tag-data/danbooru_character_tags.csv'),
    }).catch(() => new TagCatalog([]))
  }
  return catalogPromise
}

function getWorkerPath() {
  return path.join(__dirname, 'tagger-worker.js')
}

function spawnWorker() {
  if (worker) return worker
  worker = fork(getWorkerPath(), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

  worker.on('message', (msg) => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (msg.type === 'progress' || msg.type === 'complete' || msg.type === 'cancelled' || msg.type === 'error') {
      mainWindow.webContents.send('taggerV2:progress', {
        taskId: currentTaskId,
        ...msg,
      })
    }

    if (msg.type === 'log') {
      console.error('[tagger-worker]', msg.message)
    }
  })

  worker.on('exit', (code) => {
    console.error('[tagger-worker] exited with code', code)
    worker = null
    activeTask?.settle({ type: 'error', message: 'Worker process exited unexpectedly' })
  })

  return worker
}

function registerTaggerV2Handlers(win) {
  mainWindow = win

  ipcMain.handle('tagging:preview', async (_event, params) => {
    const taskId = params?.taskId || `tagging_${Date.now()}`
    const controller = new AbortController()
    taggingTasks.set(taskId, controller)
    try {
      await ensureDb()
      const onProgress = (progress) => {
        mainWindow?.webContents.send('tagging:progress', { taskId, ...progress })
      }
      const results = await generateTaggingResults({
        ...params,
        taskId,
        signal: controller.signal,
        onProgress,
      }, onProgress)
      return { success: true, taskId, data: results }
    } catch (e) {
      return { success: false, taskId, error: e.message || String(e) }
    } finally {
      taggingTasks.delete(taskId)
    }
  })

  ipcMain.handle('tagging:generate', async (_event, params) => {
    const taskId = params?.taskId || `tagging_${Date.now()}`
    const controller = new AbortController()
    taggingTasks.set(taskId, controller)
    try {
      await ensureDb()
      const onProgress = (progress) => {
        mainWindow?.webContents.send('tagging:progress', { taskId, ...progress })
      }
      const results = await generateTaggingResults({
        ...params,
        taskId,
        signal: controller.signal,
        onProgress,
      }, onProgress)
      return { success: true, taskId, data: results }
    } catch (e) {
      return { success: false, taskId, error: e.message || String(e) }
    } finally {
      taggingTasks.delete(taskId)
    }
  })

  ipcMain.handle('tagging:apply', async (_event, params) => {
    try {
      return await applyTaggingResults(params)
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('tagging:cancel', async (_event, taskId) => {
    const controller = taggingTasks.get(taskId)
    if (!controller) return { success: false, error: 'No active task' }
    controller.abort()
    taggingTasks.delete(taskId)
    return { success: true }
  })

  ipcMain.handle('tagging:listTemplates', async () => {
    try {
      return { success: true, data: { templates: loadTemplates() } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('tagging:saveTemplate', async (_event, template) => {
    try {
      const saved = upsertTemplate(template)
      return { success: true, data: { template: saved, templates: loadTemplates() } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('tagging:deleteTemplate', async (_event, id) => {
    try {
      const templates = deleteTemplate(id)
      return { success: true, data: { templates } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('tagging:importTemplates', async (_event, entries) => {
    try {
      const result = importTemplates(entries)
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('tagging:listConfigs', async () => {
    try {
      return { success: true, data: { configs: listTaggingConfigs() } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('taggerV2:inferBatch', async (_event, params) => {
    const { modelPath, csvPath, imagePaths, threshold = 0.35, batchSize, resolution = 448, providers } = params
    if (!modelPath || !imagePaths || imagePaths.length === 0) {
      return { success: false, error: 'modelPath and imagePaths are required' }
    }
    if (activeTask) {
      return { success: false, error: 'Another tagging task is already running' }
    }

    const w = spawnWorker()
    currentTaskId = params.taskId || `task_${Date.now()}`
    const taskId = currentTaskId
    mainWindow?.webContents.send('taggerV2:progress', { taskId, type: 'started', completed: 0, total: imagePaths.length })

    return new Promise((resolve) => {
      let settled = false
      const settle = (msg) => {
        if (settled) return
        settled = true
        w.removeListener('message', onMessage)
        activeTask = null
        currentTaskId = null

        if (msg.type === 'complete') {
          const results = Array.isArray(msg.results) ? msg.results : []
          resolve({ success: true, taskId, data: { results, count: results.length } })
        } else if (msg.type === 'cancelled') {
          const results = Array.isArray(msg.results) ? msg.results : []
          resolve({ success: true, taskId, data: { results, count: results.length, cancelled: true } })
        } else {
          resolve({ success: false, taskId, error: msg.message || 'Tagging failed' })
        }
      }
      const onMessage = (msg) => {
        if (msg.type === 'ready') {
          w.send({ cmd: 'infer', imagePaths, threshold, batchSize: batchSize || 4 })
        } else if (msg.type === 'complete' || msg.type === 'cancelled' || msg.type === 'error') {
          settle(msg)
        }
      }
      activeTask = { taskId, settle }
      w.on('message', onMessage)

      w.send({
        cmd: 'init',
        modelPath,
        csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
        resolution,
        providers: providers || ['cpu'],
      })
    })
  })

  ipcMain.handle('taggerV2:cancel', async (_event, taskId) => {
    const activeId = taskId || currentTaskId
    if (worker && currentTaskId && (!activeId || activeId === currentTaskId)) {
      worker.send({ cmd: 'cancel' })
      return { success: true, taskId: currentTaskId }
    }
    const controller = taggingTasks.get(activeId)
    if (controller) {
      controller.abort()
      taggingTasks.delete(activeId)
      return { success: true, taskId: activeId }
    }
    if (worker && currentTaskId) {
      worker.send({ cmd: 'cancel' })
      return { success: true, taskId: currentTaskId }
    }
    return { success: false, error: 'No active task' }
  })

  ipcMain.handle('taggerV2:inferSingle', async (_event, params) => {
    const { modelPath, csvPath, imagePath, threshold = 0.35 } = params || {}
    if (!modelPath || !imagePath) {
      return { success: false, error: 'modelPath and imagePath are required' }
    }
    if (activeTask) {
      return { success: false, error: 'Another tagging task is already running' }
    }

    const w = spawnWorker()
    currentTaskId = `task_${Date.now()}`
    const taskId = currentTaskId

    return new Promise((resolve) => {
      let settled = false
      const settle = (msg) => {
        if (settled) return
        settled = true
        w.removeListener('message', onMessage)
        activeTask = null
        currentTaskId = null
        if (msg.type === 'complete') {
          const tags = msg.results?.[0] ? msg.results[0].tags : []
          resolve({ success: true, taskId, data: { tags } })
        } else if (msg.type === 'cancelled') {
          resolve({ success: true, taskId, data: { tags: [], cancelled: true } })
        } else {
          resolve({ success: false, taskId, error: msg.message || 'Tagging failed' })
        }
      }
      const onMessage = (msg) => {
        if (msg.type === 'ready') {
          w.send({ cmd: 'infer', imagePaths: [imagePath], threshold, batchSize: 1 })
        } else if (msg.type === 'complete' || msg.type === 'cancelled' || msg.type === 'error') {
          settle(msg)
        }
      }
      activeTask = { taskId, settle }
      w.on('message', onMessage)
      w.send({
        cmd: 'init',
        modelPath,
        csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
        resolution: params.resolution || 448,
        providers: params.providers || ['cpu'],
      })
    })
  })

  ipcMain.handle('taggerV2:bulkDryRun', async (_event, { imageIds, operation }) => {
    try {
      await ensureDb()
      const previews = []
      for (const imageId of imageIds || []) {
        const before = await getImageTagNames(imageId)
        const catalog = operation.type === 'cleanup' ? await getTagCatalog() : null
        const after = applyTagOperation(before, operation, catalog)
        previews.push({ imageId, before, after })
      }
      return { success: true, data: { previews } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('taggerV2:bulkApply', async (_event, { imageIds, operation }) => {
    try {
      await ensureDb()
      const failures = []
      let updated = 0
      for (const imageId of imageIds || []) {
        try {
          const before = await getImageTagNames(imageId)
          const catalog = operation.type === 'cleanup' ? await getTagCatalog() : null
          const after = applyTagOperation(before, operation, catalog)
          await writeImageTagsAndCaption(imageId, after)
          updated++
        } catch (error) {
          failures.push({ imageId, error: error.message })
        }
      }
      return { success: failures.length === 0, data: { updated, failures } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('taggerV2:exportTags', async (_event, { imageIds, template }) => {
    try {
      await ensureDb()
      const { serializeWeightedCaption } = require('./tag-weight')
      const results = []
      for (const imageId of imageIds || []) {
        const names = await getImageTagNames(imageId)
        const caption = serializeWeightedCaption(names.map((tag) => ({ tag, weight: 1 })))
        const rows = queryAll('SELECT path FROM images WHERE id = ?', [imageId])
        results.push({
          imageId,
          path: rows[0]?.path || '',
          tags: names,
          caption,
          template: template || 'txt',
        })
      }
      return { success: true, data: { results, count: results.length } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

function applyTagOperation(tags, operation = {}, catalog = null) {
  let result = [...new Set(tags.map(tag => tag.toLowerCase().trim()).filter(Boolean))]
  const type = operation.type
  if (type === 'add') {
    for (const tag of operation.tags || []) {
      const value = tag.toLowerCase().trim()
      if (value && !result.includes(value)) result.push(value)
    }
  } else if (type === 'remove') {
    const removeSet = new Set((operation.tags || []).map(tag => tag.toLowerCase().trim()))
    result = result.filter(tag => !removeSet.has(tag))
  } else if (type === 'replace') {
    const fromSet = new Set((operation.tags || []).map(tag => tag.toLowerCase().trim()))
    const to = (operation.replaceWith || '').toLowerCase().trim()
    result = result.map(tag => fromSet.has(tag) && to ? to : tag)
    result = [...new Set(result.filter(Boolean))]
  } else if (type === 'cleanup') {
    result = cleanupTags(result, catalog)
  }
  return result
}

function cleanupTags(tags, catalog = null) {
  const result = [...new Set(tags)]
  return result.filter(tag => {
    if (tag === 'solo' && result.some(t => /^\d+girls?$/.test(t) || t === 'multiple_girls')) return false
    if (catalog) {
      const parent = catalog.getParent(tag)
      if (parent && result.some(t => t.toLowerCase() === parent.toLowerCase())) return false
    }
    return true
  })
}

async function writeImageTagsAndCaption(imageId, tags) {
  const imageRows = queryAll('SELECT path FROM images WHERE id = ?', [imageId])
  const imagePath = imageRows[0]?.path
  if (!imagePath) throw new Error('Image not found')

  runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId])
  for (const tag of tags) {
    runSql('INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)', [tag, 'general'])
    const tagRow = queryAll('SELECT id FROM tags WHERE name = ?', [tag])[0]
    if (tagRow) {
      runSql('INSERT OR REPLACE INTO image_tags (image_id, tag_id, confidence, source) VALUES (?, ?, ?, ?)',
        [imageId, tagRow.id, null, 'manual'])
    }
  }

  const captionPath = imagePath.replace(/\.[^.]+$/, '') + '.txt'
  const result = await writeTextSafe(captionPath, tags.join(', '))
  if (!result.success) throw new Error(result.error || 'Failed to write caption')
}

function shutdownWorker() {
  if (worker) {
    try { worker.send({ cmd: 'shutdown' }) } catch (_) {}
    worker = null
  }
  activeTask?.settle({ type: 'cancelled', results: [] })
}

module.exports = { registerTaggerV2Handlers, shutdownWorker, applyTagOperation }

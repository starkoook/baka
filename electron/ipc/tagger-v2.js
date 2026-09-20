/**
 * Tagger v2 IPC Handler — Orchestrates inference worker and bridges renderer<->worker.
 */
const { ipcMain } = require('electron')
const path = require('path')
const { tagDataPath } = require('./tag-data-path')
const fs = require('fs')
const { ensureDb, queryAll, runSql } = require('./gallery')
const { TagCatalog } = require('./tag-catalog')
const { runOnnxInference } = require('./onnx-inference')
const { resolveInferOptions, resolveTaggingProviders } = require('./tagger-settings')
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
  writeImageTagsAndCaption,
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
      zhPath: tagDataPath('danbooru-0-zh.csv'),
      characterPath: tagDataPath('danbooru_character_tags.csv'),
    }).catch(() => new TagCatalog([]))
  }
  return catalogPromise
}

function registerTaggerV2Handlers(win) {
  mainWindow = win

  ipcMain.handle('tagging:preview', async (_event, params) => {
    try {
      await ensureDb()
      const taskId = params.taskId || `tagging_${Date.now()}`
      const controller = new AbortController()
      taggingTasks.set(taskId, controller)
      const results = await generateTaggingResults({
        ...params,
        signal: controller.signal,
        onProgress: (progress) => {
          mainWindow?.webContents.send('tagging:progress', { taskId, ...progress })
        },
      })
      taggingTasks.delete(taskId)
      return { success: true, data: results }
    } catch (e) {
      if (params?.taskId) taggingTasks.delete(params.taskId)
      const message = e.message || String(e)
      try { require('./app-log').writeAppLog('error', '[标注预览] ' + message, 'tagging') } catch (_) {}
      return { success: false, error: message }
    }
  })

  ipcMain.handle('tagging:generate', async (_event, params) => {
    try {
      await ensureDb()
      const taskId = params.taskId || `tagging_${Date.now()}`
      const controller = new AbortController()
      taggingTasks.set(taskId, controller)
      const results = await generateTaggingResults({
        ...params,
        signal: controller.signal,
        onProgress: (progress) => {
          mainWindow?.webContents.send('tagging:progress', { taskId, ...progress })
        },
      })
      taggingTasks.delete(taskId)
      return { success: true, data: results }
    } catch (e) {
      if (params?.taskId) taggingTasks.delete(params.taskId)
      const message = e.message || String(e)
      try { require('./app-log').writeAppLog('error', '[标注] ' + message, 'tagging') } catch (_) {}
      return { success: false, error: message }
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

  // ── Custom prompt templates ──
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

  // ── Model list & GPU info (delegated to tagger-models) ──
  // Handlers registered in tagger-models.js

  // ── Vocabulary search ──
  // Handlers registered in tagger-vocab.js

  // ── Inference ──
  ipcMain.handle('taggerV2:inferBatch', async (_event, params) => {
    const { modelPath, csvPath, imagePaths, batchSize, resolution = 448, providers } = params || {}
    if (!modelPath || !imagePaths || imagePaths.length === 0) {
      return { success: false, error: 'modelPath and imagePaths are required' }
    }
    if (activeTask) {
      return { success: false, error: 'Another tagging task is already running' }
    }

    const options = resolveInferOptions(params)
    const controller = new AbortController()
    currentTaskId = params.taskId || `task_${Date.now()}`
    const taskId = currentTaskId
    activeTask = { taskId, abort: () => controller.abort() }

    try {
      const results = await runOnnxInference({
        modelPath,
        csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
        imagePaths,
        batchSize: batchSize || 4,
        resolution,
        providers: resolveTaggingProviders({ ...params, providers }),
        normalization: params.normalization,
        padColor: params.padColor,
        resizeMode: params.resizeMode,
        inputLayout: params.inputLayout,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          mainWindow.webContents.send('taggerV2:progress', { taskId, ...progress })
        },
        ...options,
      })
      return { success: true, taskId, data: { results, count: results.length, cancelled: controller.signal.aborted } }
    } catch (error) {
      const message = error.message || String(error)
      try { require('./app-log').writeAppLog('error', '[标注] inferBatch: ' + message, 'tagging') } catch (_) {}
      return { success: false, taskId, error: message }
    } finally {
      activeTask = null
      currentTaskId = null
    }
  })

  ipcMain.handle('taggerV2:cancel', async () => {
    if (activeTask?.abort) {
      activeTask.abort()
      return { success: true }
    }
    return { success: false, error: 'No active task' }
  })

  ipcMain.handle('taggerV2:inferSingle', async (_event, params) => {
    const { modelPath, csvPath, imagePath } = params || {}
    if (!modelPath || !imagePath) {
      return { success: false, error: 'modelPath and imagePath are required' }
    }
    try {
      const options = resolveInferOptions(params)
      const results = await runOnnxInference({
        modelPath,
        csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
        imagePaths: [imagePath],
        batchSize: 1,
        resolution: params.resolution || 448,
        providers: resolveTaggingProviders(params),
        normalization: params.normalization,
        padColor: params.padColor,
        resizeMode: params.resizeMode,
        ...options,
      })
      const tags = results[0] ? results[0].tags : []
      return { success: true, data: { tags, cancelled: results[0]?.cancelled } }
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })

  // ── LLM tagging (kept from old system, uses llm.js handler) ──
  // LLM tagging is handled by the existing llm:tag IPC channel.
  // The renderer calls it directly via window.llmAPI.tagImage().

  // ── Bulk tag editing ──
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
          await writeImageTagsAndCaption(imageId, null, after)
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

  // ── Export ──
  ipcMain.handle('taggerV2:exportTags', async (_event, { imageIds, template }) => {
    try {
      // TODO: implement in Phase 7
      return { success: true, data: { results: [] } }
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

function shutdownWorker() {
  worker = null
  if (activeTask?.abort) activeTask.abort()
  activeTask = null
  currentTaskId = null
}

module.exports = { registerTaggerV2Handlers, shutdownWorker, applyTagOperation }

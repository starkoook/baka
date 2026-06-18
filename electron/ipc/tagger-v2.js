/**
 * Tagger v2 IPC Handler — Orchestrates inference worker and bridges renderer<->worker.
 */
const { ipcMain } = require('electron')
const { fork } = require('child_process')
const path = require('path')
const fs = require('fs')

let worker = null
let mainWindow = null
let currentTaskId = null
let taskResolve = null // resolve function for the current batch promise

function getWorkerPath() {
  return path.join(__dirname, 'tagger-worker.js')
}

function spawnWorker() {
  if (worker) return worker
  worker = fork(getWorkerPath(), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

  worker.on('message', (msg) => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (msg.type === 'progress' || msg.type === 'complete' || msg.type === 'cancelled' || msg.type === 'error') {
      // Forward to renderer
      mainWindow.webContents.send('taggerV2:progress', {
        taskId: currentTaskId,
        ...msg,
      })
    }

    if (msg.type === 'complete' || msg.type === 'cancelled' || msg.type === 'error') {
      if (taskResolve) {
        taskResolve(msg)
        taskResolve = null
      }
      currentTaskId = null
    }

    if (msg.type === 'log') {
      console.error('[tagger-worker]', msg.message)
    }
  })

  worker.on('exit', (code) => {
    console.error('[tagger-worker] exited with code', code)
    worker = null
    if (currentTaskId && taskResolve) {
      taskResolve({ type: 'error', message: 'Worker process exited unexpectedly' })
      taskResolve = null
      currentTaskId = null
    }
  })

  return worker
}

function registerTaggerV2Handlers(win) {
  mainWindow = win

  // ── Model list & GPU info (delegated to tagger-models) ──
  // Handlers registered in tagger-models.js

  // ── Vocabulary search ──
  // Handlers registered in tagger-vocab.js

  // ── Inference ──
  ipcMain.handle('taggerV2:inferBatch', async (_event, params) => {
    const { modelPath, csvPath, imagePaths, threshold = 0.35, batchSize, resolution = 448, providers } = params
    if (!modelPath || !imagePaths || imagePaths.length === 0) {
      return { success: false, error: 'modelPath and imagePaths are required' }
    }

    const w = spawnWorker()
    currentTaskId = `task_${Date.now()}`

    return new Promise((resolve) => {
      taskResolve = resolve

      // Init handler for this batch
      const onMsg = (msg) => {
        if (msg.type === 'ready') {
          // Worker initialized, now send inference command
          w.send({ cmd: 'infer', imagePaths, threshold, batchSize: batchSize || 4 })
        }
      }

      // Listen once for ready, then infer
      const readyHandler = (msg) => {
        if (msg.type === 'ready' || msg.type === 'error') {
          w.removeListener('message', readyHandler)
          if (msg.type === 'error') {
            resolve({ success: false, error: msg.message })
            currentTaskId = null
            taskResolve = null
          }
          // ready handled by onMsg above
        }
      }
      w.on('message', readyHandler)

      // Also listen for complete/cancelled/error to resolve
      const doneHandler = (msg) => {
        if (msg.type === 'complete') {
          w.removeListener('message', doneHandler)
          resolve({ success: true, taskId: currentTaskId, data: { results: msg.results, count: msg.results.length } })
        } else if (msg.type === 'cancelled') {
          w.removeListener('message', doneHandler)
          resolve({ success: true, taskId: currentTaskId, data: { results: msg.results, count: msg.results.length, cancelled: true } })
        } else if (msg.type === 'error') {
          w.removeListener('message', doneHandler)
          resolve({ success: false, error: msg.message })
        }
      }

      // Send init
      w.send({
        cmd: 'init',
        modelPath,
        csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
        resolution,
        providers: providers || ['cpu'],
      })

      // Set up completion listener
      const completeHandler = (msg) => {
        if (msg.type === 'complete' || msg.type === 'cancelled' || msg.type === 'error') {
          w.removeListener('message', completeHandler)
        }
        if (msg.type === 'complete') {
          resolve({ success: true, taskId: currentTaskId, data: { results: msg.results, count: msg.results.length } })
        } else if (msg.type === 'cancelled') {
          resolve({ success: true, taskId: currentTaskId, data: { results: msg.results, count: msg.results.length, cancelled: true } })
        } else if (msg.type === 'error') {
          resolve({ success: false, error: msg.message })
        }
      }
      w.on('message', completeHandler)
    })
  })

  ipcMain.handle('taggerV2:cancel', async () => {
    if (worker && currentTaskId) {
      worker.send({ cmd: 'cancel' })
      return { success: true }
    }
    return { success: false, error: 'No active task' }
  })

  ipcMain.handle('taggerV2:inferSingle', async (_event, params) => {
    // Single image inference — just wraps batch with one image
    const { modelPath, csvPath, imagePath, threshold = 0.35 } = params
    if (!modelPath || !imagePath) {
      return { success: false, error: 'modelPath and imagePath are required' }
    }

    const w = spawnWorker()

    return new Promise((resolve) => {
      const doneHandler = (msg) => {
        if (msg.type === 'ready') {
          w.send({ cmd: 'infer', imagePaths: [imagePath], threshold, batchSize: 1 })
        } else if (msg.type === 'complete') {
          w.removeListener('message', doneHandler)
          const tags = msg.results[0] ? msg.results[0].tags : []
          resolve({ success: true, data: { tags } })
        } else if (msg.type === 'cancelled') {
          w.removeListener('message', doneHandler)
          resolve({ success: true, data: { tags: [], cancelled: true } })
        } else if (msg.type === 'error') {
          w.removeListener('message', doneHandler)
          resolve({ success: false, error: msg.message })
        }
      }
      w.on('message', doneHandler)
      w.send({
        cmd: 'init',
        modelPath,
        csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
        resolution: params.resolution || 448,
        providers: params.providers || ['cpu'],
      })
    })
  })

  // ── LLM tagging (kept from old system, uses llm.js handler) ──
  // LLM tagging is handled by the existing llm:tag IPC channel.
  // The renderer calls it directly via window.llmAPI.tagImage().

  // ── Bulk tag editing ──
  ipcMain.handle('taggerV2:bulkDryRun', async (_event, { imageIds, operation }) => {
    try {
      // Phase 5: implement dry-run logic
      return { success: true, data: { previews: [] } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('taggerV2:bulkApply', async (_event, { imageIds, operation }) => {
    try {
      // TODO: implement in Phase 5
      return { success: true, data: { updated: 0 } }
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

function shutdownWorker() {
  if (worker) {
    try { worker.send({ cmd: 'shutdown' }) } catch (_) {}
    worker = null
  }
}

module.exports = { registerTaggerV2Handlers, shutdownWorker }

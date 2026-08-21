// ── Auto-fix: if ELECTRON_RUN_AS_NODE is set, re-launch without it ──
if (process.env.ELECTRON_RUN_AS_NODE) {
  const { spawn } = require('child_process')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  spawn(process.execPath, process.argv.slice(1), { env, stdio: 'inherit' })
    .on('exit', (code) => process.exit(code || 0))
  return
}

const { join } = require('path')
const { app, BrowserWindow, ipcMain, dialog, protocol, net, session } = require('electron')
const { registerLLMHandlers } = require('./ipc/llm')
const { registerUpdaterHandlers } = require('./ipc/updater')
const { registerCacheHandlers } = require('./ipc/cache')
const { registerTaggerHandlers } = require('./ipc/tagger')
const { registerTrainingHandlers } = require('./ipc/training')
const { registerRuntimeManagerHandlers } = require('./ipc/runtime-manager')
const { registerComponentManagerHandlers } = require('./ipc/component-manager')
const { registerTrainingHttpHandlers } = require('./ipc/training-http-bridge')
const { registerGalleryHandlers } = require('./ipc/gallery')
const { registerTaggerV2Handlers, shutdownWorker } = require('./ipc/tagger-v2')
const { registerCharacterTagAuditHandlers } = require('./ipc/character-tag-audit-ipc')
const { registerImageToolsHandlers } = require('./ipc/image-tools-ipc')
const { registerModelHandlers } = require('./ipc/tagger-models')
const { registerVocabHandlers } = require('./ipc/tagger-vocab')
const { registerPromptHandlers } = require('./ipc/prompt-ipc')
const { registerEffectsHandlers } = require('./ipc/effects-ipc')
const { registerNodeHandlers } = require('./ipc/nodes')
const { registerWorkflowHandlers } = require('./ipc/workflow-store')
const { registerAssetHandlers } = require('./ipc/assets')
const { registerWorkbenchImageHandlers } = require('./ipc/workbench-images')
const { registerLocalEngineHandlers } = require('./ipc/local-engines')
const { registerBooruGalleryHandlers } = require('./ipc/booru-gallery')
const { startMcpServer, stopMcpServer } = require('./mcp/mcp-server')
const { writeTextSafe, writeBytesSafe } = require('./ipc/safe-file')
const { listVersions, restoreVersion, createHistoryRecord } = require('./ipc/file-history')
const { moveToRecycle, restoreRecycleItem, listRecycleItems, purgeExpiredItems } = require('./ipc/recycle-bin')
const { moveImages } = require('./ipc/move-images-safe')
const { runFfprobe, parseProbe, extractFrames, convertVideo } = require('./ipc/video-processing')
const { registerVideoTagHandlers } = require('./ipc/video-tag')
const { ensureDb, runSql, importImageFiles } = require('./ipc/gallery')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { stream: true, bypassCSP: true, supportFetchAPI: true },
  },
])

app.commandLine.appendSwitch('disable-features', 'FocusRingEnabled')

let mainWindow = null
const videoTasks = new Map()
const isDev = !app.isPackaged

try {
  const { getDataRoot } = require('./ipc/paths')
  app.setPath('userData', path.join(getDataRoot(), 'userdata'))
} catch (e) { console.error('[main] userData 重定向失败:', e.message) }

registerLLMHandlers()
registerWorkflowHandlers()
registerAssetHandlers()
registerWorkbenchImageHandlers()
registerLocalEngineHandlers(ipcMain)
registerBooruGalleryHandlers(ipcMain)

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    const type = level === 3 ? 'error' : level === 2 ? 'warn' : 'info'
    mainWindow?.webContents.send('log:entry', { time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), type, message })
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximizeChange', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximizeChange', false)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

function loadWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/renderer/index.html'))
  }
}

ipcMain.on('window:minimize', () => { mainWindow?.minimize() })
ipcMain.on('window:maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
})
ipcMain.on('window:close', () => { mainWindow?.close() })
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

ipcMain.handle('fs:listImages', async (_event, folderPath) => {
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])
  try {
    const files = fs.readdirSync(folderPath)
    return files
      .filter((f) => imageExts.has(path.extname(f).toLowerCase()))
      .map((f) => ({
        name: f,
        path: path.join(folderPath, f),
      }))
  } catch (e) {
    return []
  }
})

ipcMain.handle('fs:readText', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, text: content }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:exists', async (_event, filePath) => {
  try { return fs.existsSync(filePath) } catch { return false }
})

ipcMain.handle('fs:readImageBase64', async (_event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
    return { success: true, base64: buffer.toString('base64'), mime }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:writeBase64', async (_event, { filePath, base64 }) => {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, buffer)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:copyFile', async (_event, { src, dest, destDir }) => {
  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(src, dest)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:readThumb', async (_event, filePath) => {
  try {
    const sharp = require('sharp')
    const buffer = await sharp(filePath).resize(384, 384, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
    return { success: true, base64: buffer.toString('base64') }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:listDataset', async (_event, folderPath) => {
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])
  try {
    const files = fs.readdirSync(folderPath)
    return files
      .filter((f) => imageExts.has(path.extname(f).toLowerCase()))
      .map((f) => {
        const base = f.replace(/\.[^.]+$/, '')
        const txtPath = path.join(folderPath, base + '.txt')
        const hasCaption = fs.existsSync(txtPath)
        return {
          name: f,
          path: path.join(folderPath, f),
          txtPath: hasCaption ? txtPath : null,
          caption: hasCaption ? fs.readFileSync(txtPath, 'utf-8') : '',
          hasCaption,
        }
      })
  } catch (e) {
    return []
  }
})

ipcMain.handle('fs:saveCaption', async (_event, { txtPath, caption }) => {
  try {
    const actualPath = txtPath || ''
    if (!actualPath) throw new Error('No path')
    if (fs.existsSync(actualPath)) await createHistoryRecord(actualPath)
    return writeTextSafe(actualPath, caption)
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:createFolder', async (_event, folderPath) => {
  try {
    if (!fs.existsSync(folderPath)) { fs.mkdirSync(folderPath, { recursive: true }); return { success: true, path: folderPath } }
    return { success: false, error: '文件夹已存在' }
  } catch (e) { return { success: false, error: e.message } }
})

ipcMain.handle('fs:moveImages', async (_event, { filePaths, destFolder, keepOriginal }) => {
  return moveImages({ filePaths, destFolder, keepOriginal })
})

ipcMain.handle('fs:writeTextSafe', async (_event, params) => {
  try {
    if (!params?.filePath) return { success: false, error: '没有文件路径' }
    if (fs.existsSync(params.filePath)) await createHistoryRecord(params.filePath)
    return writeTextSafe(params.filePath, params.text ?? '')
  } catch (e) {
    return { success: false, error: e.message }
  }
})
ipcMain.handle('fs:writeBytesSafe', async (_event, params) => {
  try {
    if (!params?.filePath) return { success: false, error: '没有文件路径' }
    return writeBytesSafe(params.filePath, Buffer.from(params.base64 || '', 'base64'))
  } catch (e) {
    return { success: false, error: e.message }
  }
})
ipcMain.handle('fs:deleteMedia', async (_event, params) => {
  const results = []
  const failures = []
  for (const filePath of params.filePaths || []) {
    const captionPath = filePath.replace(/\.[^.]+$/, '') + '.txt'
    const mediaResult = await moveToRecycle(filePath)
    if (!mediaResult.success) { failures.push({ path: filePath, error: mediaResult.error }); continue }
    if (fs.existsSync(captionPath)) await moveToRecycle(captionPath)
    await ensureDb()
    runSql('DELETE FROM image_tags WHERE image_id IN (SELECT id FROM images WHERE path = ?)', [filePath])
    runSql('DELETE FROM images WHERE path = ?', [filePath])
    results.push(filePath)
  }
  return { success: failures.length === 0, data: { moved: results.length, failures } }
})
ipcMain.handle('recycle:list', async () => ({ success: true, data: await listRecycleItems() }))
ipcMain.handle('recycle:restore', async (_event, id) => {
  const restored = await restoreRecycleItem(id)
  if (!restored.success) return restored
  const { restoredPath } = restored
  try {
    await ensureDb()
    await importImageFiles([restoredPath])
  } catch (_) {}
  return restored
})
ipcMain.handle('recycle:purge', async (_event, id) => {
  const items = await listRecycleItems()
  const item = items.find(row => row.id === id)
  if (!item) return { success: false, error: 'Item not found' }
  fs.rmSync(item.recycle_path, { force: true })
  require('./ipc/gallery').runSql('DELETE FROM recycle_items WHERE id = ?', [id])
  return { success: true }
})
ipcMain.handle('history:list', async (_event, filePath) => ({ success: true, data: await listVersions(filePath) }))
ipcMain.handle('history:restore', async (_event, id) => restoreVersion(id))

ipcMain.handle('video:probe', async (_event, videoPath) => {
  try {
    const info = parseProbe(await runFfprobe(videoPath))
    return { success: true, data: info }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('video:extract', async (_event, params) => {
  const taskId = params?.taskId || `video_${Date.now()}`
  const controller = new AbortController()
  videoTasks.set(taskId, controller)
  try {
    const frames = await extractFrames(params.videoPath, params.outputDir, {
      ...params,
      signal: controller.signal,
      onProgress: (progress) => {
        mainWindow?.webContents.send('video:progress', { taskId, ...progress })
      },
    })
    return { success: true, taskId, data: { frames } }
  } catch (e) {
    return { success: false, taskId, error: e.message }
  } finally {
    videoTasks.delete(taskId)
  }
})

ipcMain.handle('video:convert', async (_event, params) => {
  const taskId = params?.taskId || `video_${Date.now()}`
  const controller = new AbortController()
  videoTasks.set(taskId, controller)
  try {
    const outputPath = await convertVideo(params.videoPath, params.outputPath, {
      codec: params.codec,
      signal: controller.signal,
      onProgress: (progress) => {
        mainWindow?.webContents.send('video:progress', { taskId, ...progress })
      },
    })
    return { success: true, taskId, outputPath }
  } catch (e) {
    return { success: false, taskId, error: e.message }
  } finally {
    videoTasks.delete(taskId)
  }
})

ipcMain.handle('video:cancel', async (_event, taskId) => {
  const controller = videoTasks.get(taskId)
  if (!controller) return { success: false, error: 'No active task' }
  controller.abort()
  videoTasks.delete(taskId)
  return { success: true }
})

ipcMain.handle('video:setFfmpegDir', async (_event, dirPath) => {
  try {
    const fs = require('fs')
    const path = require('path')
    const { getConfigPath } = require('./ipc/paths')
    const configPath = getConfigPath()
    let config = {}
    if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config.ffmpegDir = dirPath
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('fs:scanModels', async (_event, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath)
    const onnxFiles = files.filter((f) => f.endsWith('.onnx'))
    const csvFiles = files.filter((f) => f.endsWith('.csv'))
    return {
      success: true,
      models: onnxFiles.map((f) => ({
        name: f,
        path: path.join(dirPath, f),
        hasCsv: csvFiles.includes(f.replace('.onnx', '.csv')),
      })),
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

function getGPUInfo() {
  try {
    const out = execSync('nvidia-smi --query-gpu=name,memory.used,memory.total,temperature.gpu,utilization.gpu --format=csv,noheader,nounits', {
      timeout: 3000, encoding: 'utf-8', windowsHide: true,
    }).trim()
    const parts = out.split(',').map((s) => s.trim())
    return {
      name: parts[0] || 'NVIDIA GPU',
      vramUsed: parseFloat(parts[1]) || 0,
      vramTotal: parseFloat(parts[2]) || 0,
      gpuTemp: parseFloat(parts[3]) || 0,
      gpuUsage: parseFloat(parts[4]) || 0,
    }
  } catch (_) {
    try {
      const out = execSync('wmic path win32_VideoController get Name,AdapterRAM /format:csv 2>nul', {
        timeout: 3000, encoding: 'utf-8', windowsHide: true, shell: 'cmd',
      }).trim()
      const lines = out.split('\n').filter((l) => l.includes(','))
      if (lines.length > 1) {
        const parts = lines[1].split(',')
        const ramBytes = parseInt(parts[parts.length - 1]) || 0
        return {
          name: parts[1] || 'GPU',
          vramUsed: 0,
          vramTotal: Math.round(ramBytes / 1024 / 1024),
          gpuTemp: 0,
          gpuUsage: 0,
        }
      }
    } catch (_) {}
    return null
  }
}

ipcMain.handle('system:stats', async () => {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const cpus = os.cpus()

  const cpuIdle = cpus.reduce((sum, c) => sum + c.times.idle, 0) / cpus.length
  const cpuTotal = cpus.reduce((sum, c) => sum + Object.values(c.times).reduce((a, b) => a + b, 0), 0) / cpus.length
  const cpuUsage = Math.round(((1 - cpuIdle / cpuTotal) * 100))

  const gpu = getGPUInfo()

  return {
    cpu: {
      usage: cpuUsage,
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
    },
    memory: {
      used: Math.round((totalMem - freeMem) / 1024 / 1024),
      total: Math.round(totalMem / 1024 / 1024),
      percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    gpu: gpu ? {
      name: gpu.name,
      vramUsed: gpu.vramUsed,
      vramTotal: gpu.vramTotal,
      vramPercent: gpu.vramTotal > 0 ? Math.round((gpu.vramUsed / gpu.vramTotal) * 100) : 0,
      temp: gpu.gpuTemp || 0,
      usage: gpu.gpuUsage || 0,
    } : null,
    uptime: Math.round(os.uptime()),
    platform: process.platform,
  }
})

app.whenReady().then(async () => {
  const { pathToFileURL } = require('url')
  const { loadSettings } = require('./ipc/booru-gallery')
  const gallerySettings = loadSettings()
  if (gallerySettings.proxy) {
    await session.defaultSession.setProxy({ proxyRules: `http=${gallerySettings.proxy};https=${gallerySettings.proxy}` })
  }
  protocol.handle('media', (request) => {
    try {
      const url = new URL(request.url)
      let filePath = decodeURIComponent(url.pathname || '')
      if (process.platform === 'win32' && filePath.startsWith('/')) filePath = filePath.slice(1)
      else if (filePath.startsWith('/') && fs.existsSync(filePath.slice(1)) && !fs.existsSync(filePath)) {
        filePath = filePath.slice(1)
      }
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  createWindow()

  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openDirectory'],
      title: '选择图片文件夹',
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectImages', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openFile', 'multiSelections'],
      title: '选择图片',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    })
    if (result.canceled || !result.filePaths.length) return []
    return result.filePaths
  })

  ipcMain.handle('dialog:selectImage', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openFile'],
      title: '选择预览图片',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectMedia', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openFile', 'multiSelections'],
      title: '选择素材（图片 / 视频）',
      filters: [{ name: '素材', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'mp4', 'mov', 'webm', 'mkv'] }],
    })
    if (result.canceled || !result.filePaths.length) return []
    return result.filePaths
  })

  ipcMain.handle('dialog:selectVideos', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openFile', 'multiSelections'],
      title: '选择视频',
      filters: [{ name: '视频', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'] }],
    })
    if (result.canceled || !result.filePaths.length) return []
    return result.filePaths
  })

  ipcMain.handle('dialog:selectModels', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openFile', 'multiSelections'],
      title: '选择模型文件',
      filters: [{ name: '模型文件', extensions: ['safetensors', 'ckpt', 'pt', 'pth', 'bin'] }],
    })
    if (result.canceled || !result.filePaths.length) return []
    return result.filePaths
  })

  ipcMain.handle('dialog:saveImage', async (_event, params) => {
    const dataUrl = params?.dataUrl || ''
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
    if (!match) return { success: false, error: '不是有效的图片数据' }
    const result = await dialog.showSaveDialog(null, {
      title: '保存图片',
      defaultPath: params?.defaultName || 'output.png',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    try {
      fs.writeFileSync(result.filePath, Buffer.from(match[2], 'base64'))
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: String((err && err.message) || err) }
    }
  })

  ipcMain.handle('dialog:saveFile', async (_event, params) => {
    const sourcePath = params?.sourcePath || ''
    const result = await dialog.showSaveDialog(null, {
      title: '保存文件',
      defaultPath: params?.defaultName || 'output',
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    try {
      fs.copyFileSync(sourcePath, result.filePath)
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: String((err && err.message) || err) }
    }
  })

  ipcMain.handle('dialog:saveText', async (_event, params) => {
    const result = await dialog.showSaveDialog(null, {
      title: '保存文本',
      defaultPath: params?.defaultName || 'output.txt',
      filters: [{ name: '文本', extensions: ['txt'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    try {
      fs.writeFileSync(result.filePath, params?.text ?? '', 'utf8')
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: String((err && err.message) || err) }
    }
  })

  ipcMain.handle('dialog:saveWorkflow', async (_event, params) => {
    const content = params?.content || ''
    const result = await dialog.showSaveDialog(null, {
      title: '保存画布',
      defaultPath: params?.defaultName || '工作流.bakaflow.json',
      filters: [{ name: '工作流', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    try {
      fs.writeFileSync(result.filePath, content, 'utf-8')
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: String((err && err.message) || err) }
    }
  })

  ipcMain.handle('dialog:saveWorkflowTo', async (_event, params) => {
    const filePath = params?.filePath || ''
    const content = params?.content || ''
    if (!filePath) return { success: false, error: '没有保存路径' }
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true, path: filePath }
    } catch (err) {
      return { success: false, error: String((err && err.message) || err) }
    }
  })

  ipcMain.handle('dialog:openWorkflow', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openFile'],
      title: '打开画布',
      filters: [{ name: '工作流', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true }
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      return { success: true, content, path: result.filePaths[0] }
    } catch (err) {
      return { success: false, error: String((err && err.message) || err) }
    }
  })

  registerUpdaterHandlers(mainWindow)
  registerCacheHandlers()
  registerTaggerHandlers()
  registerTrainingHandlers(mainWindow)
  registerRuntimeManagerHandlers(mainWindow)
  registerComponentManagerHandlers(mainWindow)
  registerTrainingHttpHandlers(mainWindow)
  registerGalleryHandlers(mainWindow)
  registerModelHandlers()
  registerVocabHandlers()
  registerPromptHandlers()
  registerEffectsHandlers()
  registerTaggerV2Handlers(mainWindow)
  registerCharacterTagAuditHandlers()
  registerImageToolsHandlers()
  registerVideoTagHandlers()
  registerNodeHandlers()

  loadWindow()

  ipcMain.handle('shell:openFolder', async (_event, filePath) => {
    try {
      const { shell } = require('electron')
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      loadWindow()
    }
  })

  startMcpServer().catch(e => console.error('[main] MCP start failed:', e.message))
  purgeExpiredItems(30).catch(() => {})
})

app.on('window-all-closed', () => {
  shutdownWorker()
  stopMcpServer().catch(e => console.error('[main] MCP stop failed:', e.message))
  if (process.platform !== 'darwin') app.quit()
})

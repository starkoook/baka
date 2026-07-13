// ── Auto-fix: if ELECTRON_RUN_AS_NODE is set, re-launch without it ──
if (process.env.ELECTRON_RUN_AS_NODE) {
  const { spawn } = require('child_process')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  spawn(process.execPath, process.argv.slice(1), { env, stdio: 'inherit' })
    .on('exit', (code) => process.exit(code || 0))
  // Halt this process — wait for child to exit
  return
}

const { join } = require('path')
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { registerLLMHandlers } = require('./ipc/llm')
const { registerUpdaterHandlers } = require('./ipc/updater')
const { registerCacheHandlers } = require('./ipc/cache')
const { registerTaggerHandlers } = require('./ipc/tagger')
const { registerTrainingHandlers } = require('./ipc/training')
const { registerGalleryHandlers } = require('./ipc/gallery')
const { registerTaggerV2Handlers, shutdownWorker } = require('./ipc/tagger-v2')
const { registerModelHandlers } = require('./ipc/tagger-models')
const { registerVocabHandlers } = require('./ipc/tagger-vocab')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

// Disable Chromium's built-in focus ring (the black rectangle on click)
app.commandLine.appendSwitch('disable-features', 'FocusRingEnabled')

let mainWindow = null
const isDev = !app.isPackaged

// Register LLM IPC handlers
registerLLMHandlers()

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

  // ── Capture all renderer console output → log panel ──
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

  // Clear cache on close, keep user config (theme etc)
  mainWindow.on('close', () => {
    try {
      mainWindow?.webContents.executeJavaScript(`
        (function(){
          var config = localStorage.getItem('baka-tools-config');
          localStorage.clear();
          if (config) localStorage.setItem('baka-tools-config', config);
          sessionStorage.clear();
        })()
      `)
    } catch (_) {}
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
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

// ── List image files in a folder ──
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

// ── Read text file as UTF-8 string ──
ipcMain.handle('fs:readText', async (_event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, text: content }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Check if file exists ──
ipcMain.handle('fs:exists', async (_event, filePath) => {
  try { return fs.existsSync(filePath) } catch { return false }
})

// ── Read image file as base64 ──
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

// ── Write file from base64 (for drag-drop) ──
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

// ── Copy file ──
ipcMain.handle('fs:copyFile', async (_event, { src, dest, destDir }) => {
  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(src, dest)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Read thumbnail (max 256px) ──
ipcMain.handle('fs:readThumb', async (_event, filePath) => {
  try {
    const sharp = require('sharp')
    const buffer = await sharp(filePath).resize(384, 384, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
    return { success: true, base64: buffer.toString('base64') }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Dataset: list image+txt pairs ──
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

// ── Save caption to txt file ──
ipcMain.handle('fs:saveCaption', async (_event, { txtPath, caption }) => {
  try {
    const actualPath = txtPath || ''
    if (!actualPath) throw new Error('No path')
    fs.writeFileSync(actualPath, caption, 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Create new folder ──
ipcMain.handle('fs:createFolder', async (_event, folderPath) => {
  try {
    if (!fs.existsSync(folderPath)) { fs.mkdirSync(folderPath, { recursive: true }); return { success: true, path: folderPath } }
    return { success: false, error: '文件夹已存在' }
  } catch (e) { return { success: false, error: e.message } }
})

// ── Move/copy images to folder ──
ipcMain.handle('fs:moveImages', async (_event, { filePaths, destFolder, keepOriginal }) => {
  try {
    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true })
    let moved = 0
    const destPaths = []
    for (const src of filePaths) {
      const filename = path.basename(src)
      const dest = path.join(destFolder, filename)
      // Handle duplicate filenames
      let finalDest = dest
      let n = 1
      while (fs.existsSync(finalDest)) {
        const ext = path.extname(filename)
        const base = filename.replace(ext, '')
        finalDest = path.join(destFolder, `${base}_${n}${ext}`)
        n++
      }
      if (keepOriginal) {
        fs.copyFileSync(src, finalDest)
      } else {
        fs.renameSync(src, finalDest)
      }
      destPaths.push(finalDest)
      moved++
    }
    return { success: true, data: { moved, destPaths } }
  } catch (e) { return { success: false, error: e.message } }
})

// ── Scan directory for ONNX models ──
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

// ── System monitor ──
function getGPUInfo() {
  try {
    // Try nvidia-smi on Windows
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
    // Fallback: try checking if OpenGL/Vulkan is available
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

  // Average CPU usage across all cores
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

app.whenReady().then(() => {
  createWindow()

  // ── Folder selection dialog ──
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openDirectory'],
      title: '选择图片文件夹',
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  // ── Image file selection dialog ──
  ipcMain.handle('dialog:selectImages', async () => {
    const result = await dialog.showOpenDialog(null, {
      properties: ['openFile', 'multiSelections'],
      title: '选择图片',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    })
    if (result.canceled || !result.filePaths.length) return []
    return result.filePaths
  })

  registerUpdaterHandlers(mainWindow)
  registerCacheHandlers()
  registerTaggerHandlers()
  registerTrainingHandlers(mainWindow)
  registerGalleryHandlers(mainWindow)
  registerModelHandlers()
  registerVocabHandlers()
  registerTaggerV2Handlers(mainWindow)

  // ── Open file in Explorer ──
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
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shutdownWorker()
  if (process.platform !== 'darwin') app.quit()
})

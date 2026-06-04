const { join } = require('path')
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const { registerLLMHandlers } = require('./ipc/llm')
const { registerUpdaterHandlers } = require('./ipc/updater')
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
    },
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
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.on('window:minimize', () => { mainWindow?.minimize() })
ipcMain.on('window:maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize()
})
ipcMain.on('window:close', () => { mainWindow?.close() })
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// ── Folder selection dialog ──
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择图片文件夹',
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

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
  registerUpdaterHandlers(mainWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

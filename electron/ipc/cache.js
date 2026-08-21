const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { install: installMediaProtocol } = require('./media-protocol')

function getDirSize(dir) {
  let size = 0
  try {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const fp = path.join(dir, file)
      try {
        const stat = fs.statSync(fp)
        if (stat.isDirectory()) size += getDirSize(fp)
        else size += stat.size
      } catch (_) {}
    }
  } catch (_) {}
  return size
}

function registerCacheHandlers() {
  // Re-register after main.js so filenames containing # or ? are not truncated.
  installMediaProtocol()

  ipcMain.handle('cache:getSize', async () => {
    const userDataPath = app.getPath('userData')
    const dirs = {
      '应用数据': userDataPath,
      '代码缓存': path.join(userDataPath, 'Code Cache'),
      'GPU 缓存': path.join(userDataPath, 'GPUCache'),
      'Web 存储': path.join(userDataPath, 'WebStorage'),
    }
    const result = {}
    for (const [key, dir] of Object.entries(dirs)) {
      result[key] = {
        size: Math.round(getDirSize(dir) / 1024),
      }
    }
    return result
  })

  ipcMain.handle('cache:clear', async (_event, target) => {
    const userDataPath = app.getPath('userData')
    const targets = {
      '应用数据': userDataPath,
      '代码缓存': path.join(userDataPath, 'Code Cache'),
      'GPU 缓存': path.join(userDataPath, 'GPUCache'),
      'Web 存储': path.join(userDataPath, 'WebStorage'),
    }
    const dir = targets[target]
    if (!dir) return { success: false, error: 'Unknown target' }
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerCacheHandlers }

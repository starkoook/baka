const { ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

// Configure for your update server
// Supports: GitHub Releases, S3, generic HTTP server
autoUpdater.autoDownload = false  // Let user decide
autoUpdater.autoInstallOnAppQuit = true

function registerUpdaterHandlers(mainWindow) {
  // Check for updates
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return {
        available: !!result?.updateInfo?.version,
        version: result?.updateInfo?.version || null,
        currentVersion: autoUpdater.currentVersion?.version || '0.1.0',
      }
    } catch (e) {
      return { available: false, error: e.message }
    }
  })

  // Download update
  ipcMain.on('updater:download', () => {
    autoUpdater.downloadUpdate()
  })

  // Install now
  ipcMain.on('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  // Progress events → renderer
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:progress', {
      percent: Math.round(progress.percent),
      speed: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:downloaded', {
      version: info.version,
    })
  })

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:error', err.message)
  })
}

module.exports = { registerUpdaterHandlers }

const { ipcMain } = require('electron')

let autoUpdater = null

function getAutoUpdater() {
  if (autoUpdater) return autoUpdater
  try {
    const updater = require('electron-updater')
    autoUpdater = updater.autoUpdater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    return autoUpdater
  } catch (e) {
    return null
  }
}

function registerUpdaterHandlers(mainWindow) {
  // Check for updates
  ipcMain.handle('updater:check', async () => {
    const au = getAutoUpdater()
    if (!au) return { available: false, error: 'electron-updater not available' }
    try {
      const result = await au.checkForUpdates()
      return {
        available: !!result?.updateInfo?.version,
        version: result?.updateInfo?.version || null,
        currentVersion: au.currentVersion?.version || '0.1.0',
      }
    } catch (e) {
      return { available: false, error: e.message }
    }
  })

  // Download update
  ipcMain.on('updater:download', () => {
    const au = getAutoUpdater()
    if (au) au.downloadUpdate()
  })

  // Install now
  ipcMain.on('updater:install', () => {
    const au = getAutoUpdater()
    if (au) au.quitAndInstall()
  })

  // Progress events → renderer
  const au = getAutoUpdater()
  if (!au) return
  au.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:progress', {
      percent: Math.round(progress.percent),
      speed: progress.bytesPerSecond,
    })
  })

  au.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:downloaded', {
      version: info.version,
    })
  })

  au.on('error', (err) => {
    mainWindow?.webContents.send('updater:error', err.message)
  })
}

module.exports = { registerUpdaterHandlers }

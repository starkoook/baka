const fs = require('fs')
const path = require('path')
const { app, ipcMain, shell } = require('electron')
const { getInstalledTrainer } = require('../runtime/trainer-distribution')
const { inspectLocalUpdate, recordVersions, verifyArtifact } = require('../runtime/local-update')

let pendingUpdate = null

function readRuntimeId(dataRoot) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(dataRoot, 'baka-training-config.json'), 'utf8'))
    return config.runtimeId || 'not-selected'
  } catch {
    return 'not-selected'
  }
}

function currentVersions() {
  const dataRoot = app.getPath('userData')
  const trainer = getInstalledTrainer(dataRoot)?.version || 'not-installed'
  return {
    baka: app.getVersion(),
    trainer,
    schema: trainer,
    runtime: readRuntimeId(dataRoot),
  }
}

function localManifestPath() {
  return process.env.BAKA_LOCAL_UPDATE_MANIFEST
    || path.join(app.getPath('userData'), 'updates', 'manifest.json')
}

function registerUpdaterHandlers(mainWindow) {
  ipcMain.handle('updater:check', async () => {
    try {
      const versions = currentVersions()
      recordVersions(app.getPath('userData'), versions)
      pendingUpdate = inspectLocalUpdate(localManifestPath(), versions)
      return { ...pendingUpdate, currentVersion: versions.baka, version: pendingUpdate.versions?.baka || null }
    } catch (error) {
      pendingUpdate = null
      return { available: false, source: 'local', error: error.message }
    }
  })

  ipcMain.on('updater:download', () => {
    if (!pendingUpdate?.available || !pendingUpdate.compatible) {
      mainWindow?.webContents.send('updater:error', pendingUpdate?.reasons?.join('；') || '没有可用的本地更新')
      return
    }
    const result = verifyArtifact(pendingUpdate.artifact)
    if (!result.ok) {
      mainWindow?.webContents.send('updater:error', result.error)
      return
    }
    pendingUpdate.verified = true
    mainWindow?.webContents.send('updater:progress', { percent: 100, speed: 0 })
    mainWindow?.webContents.send('updater:downloaded', {
      version: pendingUpdate.versions.baka,
      local: true,
      sha256: result.sha256,
    })
  })

  ipcMain.on('updater:install', async () => {
    if (!pendingUpdate?.verified) {
      mainWindow?.webContents.send('updater:error', '请先完成本地更新文件校验')
      return
    }
    const error = await shell.openPath(pendingUpdate.artifact.path)
    if (error) mainWindow?.webContents.send('updater:error', error)
  })
}

module.exports = { currentVersions, localManifestPath, registerUpdaterHandlers }

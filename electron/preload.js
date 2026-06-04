const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('windowAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window:maximizeChange', (_event, maximized) => {
      callback(maximized)
    })
  },
})

contextBridge.exposeInMainWorld('appAPI', {
  getVersion: () => '0.1.0',
  getPlatform: () => process.platform,
})

contextBridge.exposeInMainWorld('llmAPI', {
  tagImage: (params) => ipcRenderer.invoke('llm:tag', params),
  getConfig: () => ipcRenderer.invoke('llm:getConfig'),
  saveConfig: (config) => ipcRenderer.invoke('llm:saveConfig', config),
  listModels: (params) => ipcRenderer.invoke('llm:listModels', params),
})

contextBridge.exposeInMainWorld('fsAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  listImages: (folderPath) => ipcRenderer.invoke('fs:listImages', folderPath),
  readImageBase64: (filePath) => ipcRenderer.invoke('fs:readImageBase64', filePath),
  listDataset: (folderPath) => ipcRenderer.invoke('fs:listDataset', folderPath),
  saveCaption: (params) => ipcRenderer.invoke('fs:saveCaption', params),
  copyFile: (params) => ipcRenderer.invoke('fs:copyFile', params),
  readThumb: (filePath) => ipcRenderer.invoke('fs:readThumb', filePath),
})

contextBridge.exposeInMainWorld('systemAPI', {
  getStats: () => ipcRenderer.invoke('system:stats'),
})

contextBridge.exposeInMainWorld('logAPI', {
  onEntry: (cb) => { ipcRenderer.on('log:entry', (_e, d) => cb(d)) },
})

contextBridge.exposeInMainWorld('updaterAPI', {
  check: () => ipcRenderer.invoke('updater:check'),
  download: () => ipcRenderer.send('updater:download'),
  install: () => ipcRenderer.send('updater:install'),
  onProgress: (cb) => { ipcRenderer.on('updater:progress', (_, d) => cb(d)) },
  onDownloaded: (cb) => { ipcRenderer.on('updater:downloaded', (_, d) => cb(d)) },
  onError: (cb) => { ipcRenderer.on('updater:error', (_, e) => cb(e)) },
})

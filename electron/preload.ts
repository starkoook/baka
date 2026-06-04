import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('windowAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximizeChange', (_event, maximized) => {
      callback(maximized)
    })
  },
})

contextBridge.exposeInMainWorld('appAPI', {
  getVersion: () => '0.1.0',
  getPlatform: () => process.platform,
})

const { contextBridge, ipcRenderer, webUtils } = require('electron')

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
  getResourcesPath: () => process.resourcesPath || '',
})

contextBridge.exposeInMainWorld('llmAPI', {
  tagImage: (params) => ipcRenderer.invoke('llm:tag', params),
  getConfig: () => ipcRenderer.invoke('llm:getConfig'),
  saveConfig: (config) => ipcRenderer.invoke('llm:saveConfig', config),
  listModels: (params) => ipcRenderer.invoke('llm:listModels', params),
  test: (params) => ipcRenderer.invoke('llm:test', params),
  getProfiles: () => ipcRenderer.invoke('llm:getProfiles'),
  saveProfile: (profile) => ipcRenderer.invoke('llm:saveProfile', profile),
  switchProfile: (name) => ipcRenderer.invoke('llm:switchProfile', name),
  deleteProfile: (name) => ipcRenderer.invoke('llm:deleteProfile', name),
  chat: (params) => ipcRenderer.invoke('llm:chat', params),
  image: (params) => ipcRenderer.invoke('llm:image', params),
  listApiConfigs: () => ipcRenderer.invoke('llm:listApiConfigs'),
  saveApiConfig: (cfg) => ipcRenderer.invoke('llm:saveApiConfig', cfg),
  deleteApiConfig: (id) => ipcRenderer.invoke('llm:deleteApiConfig', id),
})

contextBridge.exposeInMainWorld('fsAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectImages: () => ipcRenderer.invoke('dialog:selectImages'),
  selectImage: () => ipcRenderer.invoke('dialog:selectImage'),
  selectMedia: () => ipcRenderer.invoke('dialog:selectMedia'),
  selectVideos: () => ipcRenderer.invoke('dialog:selectVideos'),
  selectModels: () => ipcRenderer.invoke('dialog:selectModels'),
  saveImage: (params) => ipcRenderer.invoke('dialog:saveImage', params),
  saveFile: (params) => ipcRenderer.invoke('dialog:saveFile', params),
  saveText: (params) => ipcRenderer.invoke('dialog:saveText', params),
  listImages: (folderPath) => ipcRenderer.invoke('fs:listImages', folderPath),
  readImageBase64: (filePath) => ipcRenderer.invoke('fs:readImageBase64', filePath),
  listDataset: (folderPath) => ipcRenderer.invoke('fs:listDataset', folderPath),
  saveCaption: (params) => ipcRenderer.invoke('fs:saveCaption', params),
  copyFile: (params) => ipcRenderer.invoke('fs:copyFile', params),
  readThumb: (filePath) => ipcRenderer.invoke('fs:readThumb', filePath),
  readText: (filePath) => ipcRenderer.invoke('fs:readText', filePath),
  exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  createFolder: (folderPath) => ipcRenderer.invoke('fs:createFolder', folderPath),
  moveImages: (params) => ipcRenderer.invoke('fs:moveImages', params),
  scanModels: (dirPath) => ipcRenderer.invoke('fs:scanModels', dirPath),
  writeBase64: (params) => ipcRenderer.invoke('fs:writeBase64', params),
})

contextBridge.exposeInMainWorld('systemAPI', {
  getStats: () => ipcRenderer.invoke('system:stats'),
})

contextBridge.exposeInMainWorld('logAPI', {
  onEntry: (cb) => { ipcRenderer.on('log:entry', (_e, d) => cb(d)) },
})

contextBridge.exposeInMainWorld('trainingAPI', {
  status: () => ipcRenderer.invoke('training:status'),
  setPath: (folderPath) => ipcRenderer.invoke('training:setPath', folderPath),
  launch: () => ipcRenderer.invoke('training:launch'),
  stop: () => ipcRenderer.invoke('training:stop'),
  clone: () => ipcRenderer.invoke('training:clone'),
  checkEnv: () => ipcRenderer.invoke('training:checkEnv'),
  onLog: (cb) => { ipcRenderer.on('training:log', (_, d) => cb(d)) },
  onStatusChange: (cb) => { ipcRenderer.on('training:statusChange', (_, d) => cb(d)) },
})

contextBridge.exposeInMainWorld('taggerAPI', {
  localInfer: (params) => ipcRenderer.invoke('tagger:local-infer', params),
})

contextBridge.exposeInMainWorld('cacheAPI', {
  getSize: () => ipcRenderer.invoke('cache:getSize'),
  clear: (target) => ipcRenderer.invoke('cache:clear', target),
})

contextBridge.exposeInMainWorld('shellAPI', {
  openFolder: (filePath) => ipcRenderer.invoke('shell:openFolder', filePath),
})

contextBridge.exposeInMainWorld('taggerV2API', {
  // Models
  listModels: () => ipcRenderer.invoke('taggerV2:listModels'),
  gpuInfo: () => ipcRenderer.invoke('taggerV2:gpuInfo'),
  setModelDir: (dirPath) => ipcRenderer.invoke('taggerV2:setModelDir', dirPath),
  getModelDir: () => ipcRenderer.invoke('taggerV2:getModelDir'),
  importModel: (filePath) => ipcRenderer.invoke('taggerV2:importModel', filePath),
  openModelDir: () => ipcRenderer.invoke('taggerV2:openModelDir'),
  // Inference
  inferSingle: (params) => ipcRenderer.invoke('taggerV2:inferSingle', params),
  inferBatch: (params) => ipcRenderer.invoke('taggerV2:inferBatch', params),
  cancel: (taskId) => ipcRenderer.invoke('taggerV2:cancel', taskId),
  onProgress: (callback) => { ipcRenderer.on('taggerV2:progress', (_event, data) => callback(data)) },
  // Vocabulary
  searchTags: (query, matchMode, limit, category) => ipcRenderer.invoke('taggerV2:searchTags', query, matchMode, limit, category),
  getCategories: () => ipcRenderer.invoke('taggerV2:getCategories'),
  // Bulk editing
  bulkDryRun: (imageIds, operation) => ipcRenderer.invoke('taggerV2:bulkDryRun', { imageIds, operation }),
  bulkApply: (imageIds, operation) => ipcRenderer.invoke('taggerV2:bulkApply', { imageIds, operation }),
  // Export
  exportTags: (imageIds, template) => ipcRenderer.invoke('taggerV2:exportTags', { imageIds, template }),
})

contextBridge.exposeInMainWorld('galleryAPI', {
  getFilePath: (file) => webUtils.getPathForFile(file),
  inspectDroppedPaths: (paths) => ipcRenderer.invoke('gallery:inspectDroppedPaths', paths),
  importFiles: (paths) => ipcRenderer.invoke('gallery:importFiles', paths),
  addRoot: (folderPath) => ipcRenderer.invoke('gallery:addRoot', folderPath),
  getRoots: () => ipcRenderer.invoke('gallery:getRoots'),
  removeRoot: (rootId, deleteImages) => ipcRenderer.invoke('gallery:removeRoot', { rootId, deleteImages }),
  scan: (folderPath) => ipcRenderer.invoke('gallery:scan', folderPath),
  getImages: (params) => ipcRenderer.invoke('gallery:getImages', params),
  getThumbnail: (imageId) => ipcRenderer.invoke('gallery:getThumbnail', imageId),
  getStats: () => ipcRenderer.invoke('gallery:getStats'),
  getImageTags: (imageId) => ipcRenderer.invoke('gallery:getImageTags', imageId),
  batchGetTags: (imageIds) => ipcRenderer.invoke('gallery:batchGetTags', imageIds),
  setImageTags: (imageId, tags) => ipcRenderer.invoke('gallery:setImageTags', { imageId, tags }),
  saveAnnotation: (params) => ipcRenderer.invoke('gallery:saveAnnotation', params),
  updateImagePaths: (mappings) => ipcRenderer.invoke('gallery:updateImagePaths', mappings),
  batchSetTags: (entries) => ipcRenderer.invoke('gallery:batchSetTags', { entries }),
  getMetadata: (imageId) => ipcRenderer.invoke('gallery:getMetadata', imageId),
  readFileMeta: (filePath) => ipcRenderer.invoke('gallery:readFileMeta', filePath),
  saveCaptionFile: (imageId) => ipcRenderer.invoke('gallery:saveCaptionFile', imageId),
  batchSaveCaptions: (imageIds) => ipcRenderer.invoke('gallery:batchSaveCaptions', imageIds),
  onScanProgress: (callback) => { ipcRenderer.on('gallery:scanProgress', (_event, data) => callback(data)) },
})

contextBridge.exposeInMainWorld('updaterAPI', {
  check: () => ipcRenderer.invoke('updater:check'),
  download: () => ipcRenderer.send('updater:download'),
  install: () => ipcRenderer.send('updater:install'),
  onProgress: (cb) => { ipcRenderer.on('updater:progress', (_, d) => cb(d)) },
  onDownloaded: (cb) => { ipcRenderer.on('updater:downloaded', (_, d) => cb(d)) },
  onError: (cb) => { ipcRenderer.on('updater:error', (_, e) => cb(e)) },
})

contextBridge.exposeInMainWorld('trainingHttpAPI', {
  submitTraining: (config) => ipcRenderer.invoke('thttp:submitTraining', config),
  preflight: (config) => ipcRenderer.invoke('thttp:preflight', config),
  getTasks: () => ipcRenderer.invoke('thttp:getTasks'),
  getTaskOutput: (taskId, tail) => ipcRenderer.invoke('thttp:getTaskOutput', taskId, tail),
  stopTask: (taskId) => ipcRenderer.invoke('thttp:stopTask', taskId),
  systemMonitor: () => ipcRenderer.invoke('thttp:systemMonitor'),
  gpuStatus: () => ipcRenderer.invoke('thttp:gpuStatus'),
  backendStatus: () => ipcRenderer.invoke('thttp:backendStatus'),
  getSchemas: () => ipcRenderer.invoke('thttp:getSchemas'),
  getSchemaHashes: () => ipcRenderer.invoke('thttp:getSchemaHashes'),
  getPresets: () => ipcRenderer.invoke('thttp:getPresets'),
  getScripts: () => ipcRenderer.invoke('thttp:getScripts'),
  runScript: (payload) => ipcRenderer.invoke('thttp:runScript', payload),
})

contextBridge.exposeInMainWorld('runtimeAPI', {
  defs: () => ipcRenderer.invoke('runtime:defs'),
  scan: () => ipcRenderer.invoke('runtime:scan'),
  setRepoPath: (folderPath) => ipcRenderer.invoke('runtime:setRepoPath', folderPath),
  systemInfo: () => ipcRenderer.invoke('runtime:systemInfo'),
  recommendation: () => ipcRenderer.invoke('runtime:recommendation'),
  health: (runtimeId) => ipcRenderer.invoke('runtime:health', runtimeId),
  install: (runtimeId) => ipcRenderer.invoke('runtime:install', runtimeId),
  cancelInstall: () => ipcRenderer.invoke('runtime:cancelInstall'),
  launch: (params) => ipcRenderer.invoke('runtime:launch', params),
  stop: () => ipcRenderer.invoke('runtime:stop'),
  guiStatus: () => ipcRenderer.invoke('runtime:guiStatus'),
  getConfig: () => ipcRenderer.invoke('runtime:getConfig'),
  updateConfig: (partial) => ipcRenderer.invoke('runtime:updateConfig', partial),
  distribution: () => ipcRenderer.invoke('runtime:distribution'),
  rollbackTrainer: () => ipcRenderer.invoke('runtime:rollbackTrainer'),
  autoClone: () => ipcRenderer.invoke('runtime:autoClone'),
  onLog: (cb) => {
    const listener = (_, data) => cb(data)
    ipcRenderer.on('runtime:log', listener)
    return () => ipcRenderer.removeListener('runtime:log', listener)
  },
  onStatusChange: (cb) => {
    const listener = (_, data) => cb(data)
    ipcRenderer.on('runtime:statusChange', listener)
    return () => ipcRenderer.removeListener('runtime:statusChange', listener)
  },
})

contextBridge.exposeInMainWorld('trainingComponentsAPI', {
  inspect: () => ipcRenderer.invoke('components:inspect'),
  recommendation: () => ipcRenderer.invoke('components:recommendation'),
  install: (runtimeId) => ipcRenderer.invoke('components:install', runtimeId),
  pause: () => ipcRenderer.invoke('components:pause'),
  resume: (runtimeId) => ipcRenderer.invoke('components:resume', runtimeId),
  cancel: () => ipcRenderer.invoke('components:cancel'),
  repair: (runtimeId) => ipcRenderer.invoke('components:repair', runtimeId),
  rollback: (componentId) => ipcRenderer.invoke('components:rollback', componentId),
  clearCache: () => ipcRenderer.invoke('components:clearCache'),
  exportCache: (options) => ipcRenderer.invoke('components:exportCache', options),
  importCache: (options) => ipcRenderer.invoke('components:importCache', options),
  onProgress: (cb) => {
    const listener = (_, data) => cb(data)
    ipcRenderer.on('components:progress', listener)
    return () => ipcRenderer.removeListener('components:progress', listener)
  },
})

contextBridge.exposeInMainWorld('nodesAPI', {
  list: () => ipcRenderer.invoke('nodes:list'),
  importFromGithub: (url) => ipcRenderer.invoke('nodes:importFromGithub', url),
  update: (file) => ipcRenderer.invoke('nodes:update', file),
  remove: (file) => ipcRenderer.invoke('nodes:remove', file),
  setEnabled: (file, enabled) => ipcRenderer.invoke('nodes:setEnabled', file, enabled),
})

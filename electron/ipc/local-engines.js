const { spawn } = require('child_process')
const { getDataRoot } = require('./paths')
const profileModule = require('./local-engine/profiles')
const comfyModule = require('./local-engine/comfy')
const webuiModule = require('./local-engine/webui')
const dependencyModule = require('./local-engine/dependencies')
const gitModule = require('./local-engine/git-install')

function requireProfile(profiles, id) {
  const profile = profiles.find(item => item.id === id)
  if (!profile) throw new Error('未找到本地引擎档案')
  return profile
}

function requireComfyProfile(profiles, id) {
  const profile = requireProfile(profiles, id)
  if (profile.type !== 'comfy') throw new Error('此操作仅支持 ComfyUI 档案')
  if (!profile.customNodesDir || !profile.pythonPath) throw new Error('ComfyUI 档案缺少已验证的安装路径')
  return profile
}

function engineAdapter(profile, comfy, webui) {
  return profile.type === 'comfy'
    ? { health: comfy.healthComfy, models: comfy.listComfyModels, objectInfo: comfy.getComfyObjectInfo, edit: comfy.editWithComfy }
    : { health: webui.healthWebUI, models: webui.listWebUIModels, edit: webui.editWithWebUI }
}

function createLocalEngineService(options = {}) {
  const dataRoot = options.dataRoot || getDataRoot()
  const profilesApi = options.profileStore || profileModule
  const comfy = options.comfy || comfyModule
  const webui = options.webui || webuiModule
  const dependencies = options.dependencies || dependencyModule
  const gitInstall = options.gitInstall || gitModule
  const spawnFn = options.spawnFn || spawn
  const onProgress = options.onProgress || (() => {})

  const profiles = () => profilesApi.loadProfiles(dataRoot)
  const find = id => requireProfile(profiles(), id)
  const emit = (payload, listener) => (listener || onProgress)(payload)

  function safeProfile(profile) {
    const { pythonPath, customNodesDir, extensionsDir, entryPath, mainPath, ...publicProfile } = profile
    return publicProfile
  }

  async function detect() {
    const saved = profiles()
    const local = profilesApi.detectLocalEngines(saved)
    const live = await Promise.all([
      comfy.healthComfy('http://127.0.0.1:8188').then(health => health.healthy ? [{ valid: true, type: 'comfy', baseUrl: 'http://127.0.0.1:8188', live: true }] : []).catch(() => []),
      webui.healthWebUI('http://127.0.0.1:7860').then(health => health.healthy ? [{ valid: true, type: 'webui', baseUrl: 'http://127.0.0.1:7860', live: true }] : []).catch(() => []),
    ])
    return [...local, ...live.flat()]
  }

  async function validateRoot({ root, type }) {
    return profilesApi.detectEngineRoot(root, type)
  }

  async function saveProfile(input) {
    const detected = profilesApi.detectEngineRoot(input?.root, input?.type)
    if (!detected.valid) throw new Error(detected.error)
    const profile = {
      ...detected,
      id: String(input?.id || `${detected.type}-${Date.now()}`),
      name: String(input?.name || (detected.type === 'comfy' ? '本机 ComfyUI' : '本机 WebUI / Forge')),
      baseUrl: typeof input?.baseUrl === 'string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(input.baseUrl) ? input.baseUrl : detected.baseUrl,
      lastValidatedAt: Date.now(),
    }
    profilesApi.saveProfile(dataRoot, profile)
    return profile
  }

  async function health(profileId) {
    const profile = find(profileId)
    const adapter = engineAdapter(profile, comfy, webui)
    return adapter.health(profile.baseUrl)
  }

  async function listModels(profileId) {
    const profile = find(profileId)
    return engineAdapter(profile, comfy, webui).models(profile.baseUrl)
  }

  async function objectInfo(profileId) {
    const profile = requireComfyProfile(profiles(), profileId)
    return comfy.getComfyObjectInfo(profile.baseUrl)
  }

  async function editImage(input) {
    const profile = find(input?.profileId)
    const { profileId, pythonPath, customNodesDir, extensionsDir, entryPath, mainPath, ...request } = input || {}
    try {
      const image = await engineAdapter(profile, comfy, webui).edit({ ...request, baseUrl: profile.baseUrl })
      return { success: true, image }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  async function start(profileId, progress) {
    const profile = find(profileId)
    emit({ profileId, stage: 'starting', message: '正在启动本地引擎' }, progress)
    let child
    if (profile.type === 'comfy') {
      if (!profile.pythonPath || !profile.mainPath || !profile.engineRoot) throw new Error('ComfyUI 档案缺少已验证的启动路径')
      const port = new URL(profile.baseUrl).port || '8188'
      child = spawnFn(profile.pythonPath, [profile.mainPath, '--listen', '127.0.0.1', '--port', port], { cwd: profile.engineRoot, windowsHide: true, detached: false })
    } else {
      if (!profile.entryPath || !profile.root) throw new Error('WebUI 档案缺少已验证的启动入口')
      child = spawnFn(profile.entryPath, [], { cwd: profile.root, shell: true, windowsHide: true, detached: false })
    }
    child?.once?.('error', error => emit({ profileId, stage: 'error', message: error.message }, progress))
    emit({ profileId, stage: 'waiting', message: '正在等待本地引擎就绪' }, progress)
    return { success: true, started: true }
  }

  async function dependencyIndex(force = false) {
    return dependencies.loadDependencyMap(dataRoot, { force })
  }

  async function resolveDependencies({ profileId, required = [], hints = [] }) {
    const profile = requireComfyProfile(profiles(), profileId)
    const [index, info] = await Promise.all([dependencyIndex(false), comfy.getComfyObjectInfo(profile.baseUrl)])
    return dependencies.resolveMissingNodes(required, Object.keys(info || {}), hints, index)
  }

  async function refreshDependencyMap() {
    await dependencyIndex(true)
    return { refreshed: true }
  }

  async function installRepository({ profileId, repository }, progress) {
    const profile = requireComfyProfile(profiles(), profileId)
    emit({ profileId, repository, stage: 'cloning', message: '正在拉取插件仓库' }, progress)
    try {
      const result = await gitInstall.installRepository({ customNodesDir: profile.customNodesDir, repository })
      emit({ profileId, repository, stage: 'complete', message: '插件已拉取', success: true }, progress)
      return result
    } catch (error) {
      emit({ profileId, repository, stage: 'error', message: error.message, success: false }, progress)
      throw error
    }
  }

  async function updateRepository({ profileId, repository }, progress) {
    const profile = requireComfyProfile(profiles(), profileId)
    emit({ profileId, repository, stage: 'updating', message: '正在更新插件仓库' }, progress)
    try {
      const result = await gitInstall.updateRepository({ customNodesDir: profile.customNodesDir, repository })
      emit({ profileId, repository, stage: 'complete', message: '插件已更新', success: true }, progress)
      return result
    } catch (error) {
      emit({ profileId, repository, stage: 'error', message: error.message, success: false }, progress)
      throw error
    }
  }

  async function installRequirements({ profileId, repository }, progress) {
    const profile = requireComfyProfile(profiles(), profileId)
    const target = gitInstall.deriveRepositoryTarget(profile.customNodesDir, repository)
    const requirementsPath = require('path').join(target, 'requirements.txt')
    emit({ profileId, repository, stage: 'installing-dependencies', message: '正在安装 requirements.txt 依赖' }, progress)
    try {
      const result = await gitInstall.installRequirements({ pythonPath: profile.pythonPath, requirementsPath })
      emit({ profileId, repository, stage: 'complete', message: '依赖安装完成', success: true }, progress)
      return result
    } catch (error) {
      emit({ profileId, repository, stage: 'error', message: error.message, success: false }, progress)
      throw error
    }
  }

  return {
    detect,
    listProfiles: async () => profiles().map(safeProfile),
    validateRoot,
    saveProfile,
    removeProfile: async id => profilesApi.removeProfile(dataRoot, id),
    health,
    listModels,
    objectInfo,
    start,
    editImage,
    resolveDependencies,
    refreshDependencyMap,
    installRepository,
    updateRepository,
    installRequirements,
  }
}

function registerLocalEngineHandlers(ipcMain, options = {}) {
  const service = createLocalEngineService(options)
  const progress = event => payload => event.sender.send('localEngine:progress', payload)
  ipcMain.handle('localEngine:detect', () => service.detect())
  ipcMain.handle('localEngine:listProfiles', () => service.listProfiles())
  ipcMain.handle('localEngine:validateRoot', (_event, input) => service.validateRoot(input))
  ipcMain.handle('localEngine:saveProfile', (_event, input) => service.saveProfile(input))
  ipcMain.handle('localEngine:removeProfile', (_event, id) => service.removeProfile(id))
  ipcMain.handle('localEngine:health', (_event, profileId) => service.health(profileId))
  ipcMain.handle('localEngine:listModels', (_event, profileId) => service.listModels(profileId))
  ipcMain.handle('localEngine:objectInfo', (_event, profileId) => service.objectInfo(profileId))
  ipcMain.handle('localEngine:start', (event, profileId) => service.start(profileId, progress(event)))
  ipcMain.handle('localEngine:editImage', (_event, input) => service.editImage(input))
  ipcMain.handle('localEngine:resolveDependencies', (_event, input) => service.resolveDependencies(input))
  ipcMain.handle('localEngine:refreshDependencyMap', () => service.refreshDependencyMap())
  ipcMain.handle('localEngine:installRepository', (event, input) => service.installRepository(input, progress(event)))
  ipcMain.handle('localEngine:updateRepository', (event, input) => service.updateRepository(input, progress(event)))
  ipcMain.handle('localEngine:installRequirements', (event, input) => service.installRequirements(input, progress(event)))
  return service
}

module.exports = { createLocalEngineService, registerLocalEngineHandlers }

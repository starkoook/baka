const { app, ipcMain } = require('electron')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { installArchive, writeJsonAtomic } = require('../components/archive')
const { clearComponentCache, exportComponentCache, importComponentCache, inspectComponentCache } = require('../components/cache')
const { ComponentDownload } = require('../components/download')
const { TrainingComponentManager } = require('../components/manager')
const { isRuntimeBusy } = require('./runtime-manager')

let componentManager = null
let mainWindow = null

function sourceLocation() {
  if (process.env.BAKA_COMPONENT_SOURCE) return process.env.BAKA_COMPONENT_SOURCE
  const configs = [
    path.join(app.getPath('userData'), 'component-source.json'),
    app.isPackaged ? path.join(process.resourcesPath, 'component-source.json') : path.resolve(__dirname, '..', '..', 'resources', 'component-source.json'),
  ]
  for (const configPath of configs) {
    try {
      const configured = JSON.parse(fs.readFileSync(configPath, 'utf8')).manifestUrl
      if (configured) return configured
    } catch {}
  }
  const importedManifest = path.join(app.getPath('userData'), 'component-cache', 'manifest.json')
  if (fs.existsSync(importedManifest)) return importedManifest
  if (app.isPackaged) return path.join(process.resourcesPath, 'component-source', 'manifest.json')
  return path.resolve(__dirname, '..', '..', '.cache', 'component-source', 'manifest.json')
}

function isRemote(value) {
  return /^https?:\/\//i.test(value)
}

async function readSourceManifest() {
  const location = sourceLocation()
  if (isRemote(location)) {
    const response = await fetch(location, { cache: 'no-store' })
    if (!response.ok) throw new Error(`组件清单下载失败：HTTP ${response.status}`)
    return response.json()
  }
  if (!fs.existsSync(location)) throw new Error('本地测试组件源尚未生成')
  return JSON.parse(fs.readFileSync(location, 'utf8'))
}

function componentSource(component) {
  const manifestLocation = sourceLocation()
  if (isRemote(manifestLocation)) return new URL(component.file, manifestLocation).toString()
  return path.resolve(path.dirname(manifestLocation), component.file)
}

function freeDiskSpace(target) {
  fs.mkdirSync(target, { recursive: true })
  const stats = fs.statfsSync(target)
  return { free: Number(stats.bavail) * Number(stats.bsize) }
}

function runtimePythonPath(directory, component) {
  const candidates = [
    component.pythonPath,
    'python.exe',
    path.join('python', 'python.exe'),
    path.join('env', 'python', 'python.exe'),
  ].filter(Boolean)
  return candidates.map(candidate => path.join(directory, candidate)).find(fs.existsSync) || ''
}

function inspectRuntimeDirectory(directory, component) {
  const pythonPath = runtimePythonPath(directory, component)
  if (!pythonPath) return { ok: false, error: '运行环境中没有找到 python.exe' }
  try {
    const output = execFileSync(pythonPath, ['-c', 'import json, torch; print(json.dumps({"torch": torch.__version__, "cuda": torch.cuda.is_available()}))'], {
      encoding: 'utf8', timeout: 60000, windowsHide: true,
    }).trim().split(/\r?\n/).pop()
    return { ok: true, pythonPath, ...JSON.parse(output) }
  } catch (error) {
    return { ok: false, pythonPath, error: `PyTorch 环境检查失败：${error.message}` }
  }
}

function findLegacyRuntime(dataRoot) {
  let configuredRepo = ''
  try {
    const config = JSON.parse(fs.readFileSync(path.join(dataRoot, 'baka-training-config.json'), 'utf8'))
    configuredRepo = config.repoPath || ''
  } catch {}
  const trainerPath = require('../runtime/trainer-distribution').getInstalledTrainer(dataRoot)?.path || ''
  const candidates = [configuredRepo, trainerPath, path.join(dataRoot, 'lora-rescripts')].filter(Boolean)
  for (const candidate of candidates) {
    const health = inspectRuntimeDirectory(candidate, {})
    if (health.ok) return { id: 'standard', version: `legacy-torch-${health.torch || 'unknown'}`, path: candidate }
  }
  return null
}

function recommendRuntime() {
  try {
    const output = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], {
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    }).trim()
    const [gpuName = 'NVIDIA GPU', memory = '0'] = output.split(/\r?\n/)[0].split(',').map(value => value.trim())
    return {
      preferred_runtime_id: 'standard',
      gpu_vendor: 'NVIDIA',
      gpu_name: gpuName,
      vram_mb: Number(memory) || 0,
      reason_zh: '检测到 NVIDIA 显卡，推荐标准训练环境',
    }
  } catch {
    try {
      const names = execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'], {
        encoding: 'utf8', timeout: 10000, windowsHide: true,
      }).trim()
      if (/radeon|\bamd\b/i.test(names)) return { preferred_runtime_id: 'rocm-amd', gpu_vendor: 'AMD', gpu_name: names, reason_zh: '检测到 AMD 显卡，推荐 ROCm 训练环境' }
      if (/intel|\barc\b|iris/i.test(names)) return { preferred_runtime_id: 'intel-xpu', gpu_vendor: 'Intel', gpu_name: names, reason_zh: '检测到 Intel 显卡，推荐 Intel XPU 训练环境' }
      return { preferred_runtime_id: null, gpu_vendor: 'unknown', gpu_name: names, reason_zh: '暂时无法为这台电脑自动匹配训练环境' }
    } catch {
      return { preferred_runtime_id: null, gpu_vendor: 'unknown', reason_zh: '未检测到受支持的显卡，暂不建议安装训练环境' }
    }
  }
}

function emitProgress(payload) {
  mainWindow?.webContents.send('components:progress', payload)
}

function createComponentManager() {
  const dataRoot = app.getPath('userData')
  const packageRoot = path.join(dataRoot, 'component-cache')
  return new TrainingComponentManager({
    dataRoot,
    bakaVersion: app.getVersion(),
    readManifest: readSourceManifest,
    recommendation: async () => recommendRuntime(),
    diskSpace: async target => freeDiskSpace(target),
    isTrainingActive: isRuntimeBusy,
    inspectHealth: async installed => {
      const trainer = installed.trainer
      if (!trainer?.path || !fs.existsSync(path.join(trainer.path, 'gui.py'))) return { ok: false, error: '训练器核心文件缺失' }
      const runtimeEntry = Object.entries(installed).find(([id]) => id.startsWith('runtime-'))
      if (!runtimeEntry) return { ok: false, error: '训练环境尚未安装' }
      const [componentId, runtime] = runtimeEntry
      const manifest = await readSourceManifest().catch(() => ({ components: {} }))
      return inspectRuntimeDirectory(runtime.path, manifest.components?.[componentId] || {})
    },
    findLegacyRuntime: async () => findLegacyRuntime(dataRoot),
    downloadFactory: (component, onProgress) => new ComponentDownload({
      source: componentSource(component),
      target: path.join(packageRoot, component.file),
      size: component.size,
      sha256: component.sha256,
      onProgress: progress => {
        onProgress(progress)
        emitProgress({ componentId: component.id, ...progress })
      },
    }),
    archiveInstaller: async ({ componentId, component, archivePath, runtimeId }) => {
      const isTrainer = componentId === 'trainer'
      const root = isTrainer ? path.join(dataRoot, 'trainer') : path.join(dataRoot, 'runtimes', runtimeId)
      return installArchive({
        archivePath,
        versionsRoot: path.join(root, 'versions'),
        version: component.version,
        activePath: path.join(root, 'active.json'),
        healthCheck: directory => isTrainer
          ? fs.existsSync(path.join(directory, 'gui.py'))
          : inspectRuntimeDirectory(directory, component).ok,
      })
    },
    activateComponent: async (componentId, next, current) => {
      if (!next?.path || !fs.existsSync(next.path)) throw new Error(`${componentId} 的回退版本文件不存在`)
      const root = componentId === 'trainer'
        ? path.join(dataRoot, 'trainer')
        : path.join(dataRoot, 'runtimes', componentId.replace(/^runtime-/, ''))
      writeJsonAtomic(path.join(root, 'active.json'), {
        activeVersion: next.version,
        previousVersion: current?.version || null,
        updatedAt: new Date().toISOString(),
      })
    },
    runtimeHealthCheck: async (runtimeId, installed) => {
      if (!installed?.path) return { ok: false, error: `${runtimeId} 运行环境未安装` }
      const manifest = await readSourceManifest()
      const component = manifest.components?.[`runtime-${runtimeId}`] || {}
      return inspectRuntimeDirectory(installed.path, component)
    },
    cache: {
      clear: async () => clearComponentCache(packageRoot),
      inspect: async ({ source }) => inspectComponentCache({ source }),
      export: async ({ destination, componentIds }) => exportComponentCache({
        manifest: await readSourceManifest(), componentIds, packageRoot, destination,
      }),
      import: async ({ source }) => importComponentCache({ source, packageRoot }),
    },
  })
}

function getComponentManager() {
  if (!componentManager) componentManager = createComponentManager()
  return componentManager
}

function registerComponentManagerHandlers(win) {
  mainWindow = win
  const manager = getComponentManager()
  manager.migrateExisting().catch(error => console.error('[components] migration failed:', error.message))
  ipcMain.handle('components:inspect', () => manager.inspect())
  ipcMain.handle('components:recommendation', () => manager.recommendation())
  ipcMain.handle('components:install', (_event, runtimeId) => manager.install(runtimeId))
  ipcMain.handle('components:pause', () => manager.pause())
  ipcMain.handle('components:resume', (_event, runtimeId) => manager.resume(runtimeId))
  ipcMain.handle('components:cancel', () => manager.cancel())
  ipcMain.handle('components:repair', (_event, runtimeId) => manager.repair(runtimeId))
  ipcMain.handle('components:rollback', (_event, componentId) => manager.rollback(componentId))
  ipcMain.handle('components:clearCache', () => manager.clearCache())
  ipcMain.handle('components:exportCache', (_event, options) => manager.exportCache(options))
  ipcMain.handle('components:importCache', (_event, options) => manager.importCache(options))
}

module.exports = { createComponentManager, getComponentManager, registerComponentManagerHandlers }

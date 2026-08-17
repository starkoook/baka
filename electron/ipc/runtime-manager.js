/**
 * Runtime manager.
 * Runtime definitions and validation come from the selected trainer repository.
 * Electron owns only the bridge and child-process lifecycle.
 */
const { ipcMain, app } = require('electron')
const { spawn, execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { selectTrainerRepo } = require('../runtime/repo-selector')
const {
  getInstalledTrainer,
  readTrainerVersion,
  rollbackTrainer,
} = require('../runtime/trainer-distribution')
const { getManagedRuntime } = require('../components/installed')

const LOCAL_REFERENCE_REPO = 'D:\\comfyUI\\lora-rescripts-study'

let mainWindow = null
let guiProcess = null
let activeInstall = null

function getConfigPath() {
  return path.join(app.getPath('userData'), 'baka-training-config.json')
}

function loadConfig() {
  try {
    const configPath = getConfigPath()
    return fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
  } catch {
    return {}
  }
}

function saveConfig(partial) {
  const next = { ...loadConfig(), ...partial }
  fs.writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

function getRepoRoot() {
  const configured = loadConfig().repoPath
  const dataRoot = app.getPath('userData')
  const installed = getInstalledTrainer(dataRoot)?.path || ''
  if (app.isPackaged) return selectTrainerRepo('', [installed])
  const bundled = path.resolve(__dirname, '..', '..', 'lora-rescripts-main')
  return selectTrainerRepo(configured, [LOCAL_REFERENCE_REPO, installed, bundled])
}

function getTrainerDistribution() {
  const active = getInstalledTrainer(app.getPath('userData'))
  const repoRoot = getRepoRoot()
  return {
    repoPath: repoRoot,
    version: repoRoot ? readTrainerVersion(repoRoot) : '',
    managed: !!active && active.path === repoRoot,
    packaged: app.isPackaged,
  }
}

function findPython() {
  for (const executable of ['python', 'python3']) {
    try {
      const version = execFileSync(executable, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      }).trim()
      if (/^Python\s/i.test(version)) {
        return { path: executable, version: version.replace(/^Python\s*/i, '') }
      }
    } catch {}
  }
  return null
}

function findGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', timeout: 5000, windowsHide: true })
    return true
  } catch {
    return false
  }
}

function detectCUDA() {
  try {
    const output = execFileSync('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits',
    ], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    const gpus = output.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [name = 'NVIDIA GPU', memory = '0', driver = ''] = line.split(',').map(value => value.trim())
      return { name, vramTotal: Number(memory) || 0, driver }
    })
    return { available: gpus.length > 0, gpus, cudaVersion: null }
  } catch {
    return { available: false, gpus: [], cudaVersion: null }
  }
}

function runLauncherBridge(repoRoot, method, params = {}, task = null, pythonExecutable = '') {
  return new Promise((resolve, reject) => {
    const managedPython = pythonExecutable || getManagedRuntime(app.getPath('userData'))?.pythonPath
    const python = managedPython ? { path: managedPython } : (app.isPackaged ? null : findPython())
    if (!python?.path) {
      reject(new Error('未找到可用于运行环境检测的 Python'))
      return
    }
    const bridgePath = path.resolve(__dirname, '..', 'runtime', 'launcher_bridge.py')
    const child = spawn(python.path, [bridgePath, '--repo', repoRoot], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1' },
    })
    if (task) task.process = child
    const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (task?.process === child) task.process = null
      if (code !== 0) {
        reject(new Error(stderr.trim() || `运行环境桥接退出，代码 ${code}`))
        return
      }
      try {
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean)
        const response = JSON.parse(lines[lines.length - 1] || '{}')
        if (!response.ok) throw new Error(response.error || '运行环境桥接失败')
        resolve(response.result)
      } catch (error) {
        reject(new Error(`无法读取运行环境结果：${error.message}`))
      }
    })
    child.stdin.end(`${JSON.stringify({ id: requestId, method, params })}\n`)
  })
}

function normalizeRuntimeStatus(definition, rawStatus) {
  const state = rawStatus || {}
  let status = 'missing'
  if (state.installed && state.integrity_ok) status = 'installed'
  else if (state.python_exists && state.integrity_ok) status = 'initialized'
  else if (state.python_exists || state.env_dir) status = state.integrity_issue_code ? 'broken' : 'partial'

  return {
    id: definition.id,
    name_zh: definition.name_zh,
    name_en: definition.name_en,
    desc_zh: definition.desc_zh,
    desc_en: definition.desc_en,
    category: definition.category,
    experimental: !!definition.experimental,
    env_vars: Object.fromEntries((definition.runtime_env_vars || []).map(item => [item.key, item.value])),
    status,
    statusText: state.status_text || status,
    pythonPath: state.python_path || null,
    envDir: state.env_dir || null,
    integrityIssue: state.integrity_message_zh || null,
  }
}

async function scanRuntimes(repoRoot) {
  const managed = getManagedRuntime(app.getPath('userData'))
  const [definitions, statuses] = await Promise.all([
    runLauncherBridge(repoRoot, 'get_runtime_defs'),
    runLauncherBridge(repoRoot, 'get_runtimes'),
  ])
  if (managed) {
    statuses[managed.id] = {
      ...(statuses[managed.id] || {}),
      installed: true,
      integrity_ok: true,
      python_exists: true,
      python_path: managed.pythonPath,
      env_dir: managed.path,
      status_text: '已由 Baka 组件管理器安装',
    }
  }
  return definitions.map(definition => normalizeRuntimeStatus(definition, statuses[definition.id]))
}

function emitRuntimeLog(type, message, runtimeId) {
  mainWindow?.webContents.send('runtime:log', {
    type,
    message,
    runtimeId,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
  })
}

function runInstallCommand(command, task) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args || [], {
      cwd: command.cwd,
      env: { ...process.env, PYTHONUTF8: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    task.process = child
    const forward = chunk => {
      const text = chunk.toString().trim()
      if (text) emitRuntimeLog('info', text, task.runtimeId)
    }
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)
    child.on('error', reject)
    child.on('close', code => {
      task.process = null
      if (task.cancelRequested) resolve({ cancelled: true, code })
      else if (code === 0) resolve({ cancelled: false, code })
      else reject(new Error(`${command.label_zh || '安装步骤'}失败，退出代码 ${code}`))
    })
  })
}

async function installRuntime(repoRoot, runtimeId) {
  if (activeInstall) return { success: false, error: '已有安装任务正在进行' }

  const task = {
    id: `runtime_${Date.now()}`,
    runtimeId,
    state: 'preparing',
    cancelRequested: false,
    process: null,
  }
  activeInstall = task
  emitRuntimeLog('info', '正在读取安装计划…', runtimeId)

  try {
    let statuses = await runLauncherBridge(repoRoot, 'get_runtimes')
    let status = statuses[runtimeId]
    if (!status?.python_exists || !status?.bootstrap_ready || !status?.integrity_ok) {
      task.state = 'initializing'
      emitRuntimeLog('info', '正在初始化项目独立 Python 环境…', runtimeId)
      const initialized = await runLauncherBridge(repoRoot, 'initialize_runtime', {
        runtime_id: runtimeId,
        settings: loadConfig(),
      }, task)
      for (const line of initialized?.log_lines || []) emitRuntimeLog('info', line, runtimeId)
      if (task.cancelRequested) {
        return { success: false, cancelled: true, runtimeId, taskId: task.id }
      }
      statuses = await runLauncherBridge(repoRoot, 'get_runtimes')
      status = statuses[runtimeId]
      if (!status?.python_exists || !status?.bootstrap_ready || !status?.integrity_ok) {
        throw new Error(status?.integrity_message_zh || '独立 Python 环境初始化后复检未通过')
      }
    }

    const plan = await runLauncherBridge(repoRoot, 'get_install_plan', {
      runtime_id: runtimeId,
      settings: loadConfig(),
    })
    if (!plan?.commands?.length) throw new Error('训练仓库没有返回可执行的安装计划')

    task.state = 'running'
    for (let index = 0; index < plan.commands.length; index++) {
      if (task.cancelRequested) break
      const command = plan.commands[index]
      emitRuntimeLog('info', `执行安装步骤 ${index + 1}/${plan.commands.length}：${command.label_zh || command.label_en}`, runtimeId)
      const result = await runInstallCommand(command, task)
      if (result.cancelled) break
    }

    if (task.cancelRequested) {
      task.state = 'cancelled'
      emitRuntimeLog('warn', '安装进程已停止，正在重新检查环境', runtimeId)
      return { success: false, cancelled: true, runtimeId, taskId: task.id }
    }

    statuses = await runLauncherBridge(repoRoot, 'get_runtimes')
    status = statuses[runtimeId]
    if (!status?.installed || !status?.integrity_ok) {
      throw new Error(status?.integrity_message_zh || '安装脚本已结束，但环境复检未通过')
    }
    task.state = 'completed'
    return { success: true, runtimeId, taskId: task.id }
  } catch (error) {
    task.state = task.cancelRequested ? 'cancelled' : 'failed'
    if (task.cancelRequested) {
      return { success: false, cancelled: true, runtimeId, taskId: task.id }
    }
    emitRuntimeLog('error', error.message, runtimeId)
    return { success: false, runtimeId, taskId: task.id, error: error.message }
  } finally {
    activeInstall = null
  }
}

function requestInstallCancellation() {
  if (!activeInstall) return { success: false, error: '没有正在进行的安装' }
  activeInstall.cancelRequested = true
  activeInstall.state = 'cancelling'
  emitRuntimeLog('warn', '正在停止当前安装步骤，停止后不会继续下一步', activeInstall.runtimeId)
  const processToStop = activeInstall.process
  if (processToStop?.pid) {
    try { processToStop.kill() } catch {}
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(processToStop.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } catch {}
    }
  }
  return { success: true, runtimeId: activeInstall.runtimeId, state: 'cancelling' }
}

async function launchGUI(repoRoot, runtimeId, port) {
  if (guiProcess) return { success: true, alreadyRunning: true, url: `http://127.0.0.1:${port}` }

  const managed = getManagedRuntime(app.getPath('userData'), runtimeId)
  if (!managed) throw new Error('所选训练环境尚未通过 Baka 组件管理器安装')
  const definitions = await runLauncherBridge(repoRoot, 'get_runtime_defs', {}, null, managed.pythonPath)
  const selectedId = managed.id
  const definition = definitions.find(item => item.id === selectedId)
  if (!definition) {
    throw new Error('所选运行环境尚未安装完成')
  }

  const env = { ...process.env, PYTHONUTF8: '1' }
  for (const item of definition.runtime_env_vars || []) env[item.key] = item.value
  guiProcess = spawn(managed.pythonPath, ['gui.py', '--port', String(port)], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  guiProcess.stdout?.on('data', chunk => emitRuntimeLog('info', chunk.toString().trim(), selectedId))
  guiProcess.stderr?.on('data', chunk => emitRuntimeLog('error', chunk.toString().trim(), selectedId))
  guiProcess.on('close', code => {
    guiProcess = null
    mainWindow?.webContents.send('runtime:statusChange', {
      running: false,
      error: code === 0 ? undefined : `exit code ${code}`,
    })
  })
  guiProcess.on('error', error => {
    guiProcess = null
    mainWindow?.webContents.send('runtime:statusChange', { running: false, error: error.message })
  })
  mainWindow?.webContents.send('runtime:statusChange', { running: true })
  return { success: true, url: `http://127.0.0.1:${port}` }
}

function stopGUI() {
  if (!guiProcess) return { success: true }
  try {
    guiProcess.kill()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function cloneRepo(targetDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['clone', '--depth', '1', 'https://github.com/AisukaYomi/SD-ReScripts.git', targetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    child.stdout.on('data', chunk => emitRuntimeLog('info', chunk.toString().trim()))
    child.stderr.on('data', chunk => emitRuntimeLog('info', chunk.toString().trim()))
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(targetDir) : reject(new Error(`下载失败，退出代码 ${code}`)))
  })
}

function managedRuntimeHealth(runtimeId) {
  const runtime = getManagedRuntime(app.getPath('userData'), runtimeId)
  if (!runtime) return { ok: false, error: '训练环境尚未安装' }
  try {
    const output = execFileSync(runtime.pythonPath, ['-c', 'import json, torch; print(json.dumps({"torch": torch.__version__, "cuda": torch.cuda.is_available()}))'], {
      encoding: 'utf8', timeout: 30000, windowsHide: true,
    }).trim()
    return { ok: true, runtimeId: runtime.id, pythonPath: runtime.pythonPath, ...JSON.parse(output.split(/\r?\n/).pop()) }
  } catch (error) {
    return { ok: false, runtimeId: runtime.id, pythonPath: runtime.pythonPath, error: error.message }
  }
}

function registerRuntimeManagerHandlers(win) {
  mainWindow = win

  ipcMain.handle('runtime:defs', async () => {
    const repoRoot = getRepoRoot()
    return repoRoot ? runLauncherBridge(repoRoot, 'get_runtime_defs') : []
  })
  ipcMain.handle('runtime:scan', async () => {
    const repoRoot = getRepoRoot()
    const hasRepo = !!repoRoot
    return { repoPath: repoRoot, hasRepo, runtimes: hasRepo ? await scanRuntimes(repoRoot) : [] }
  })
  ipcMain.handle('runtime:setRepoPath', async (_event, folderPath) => {
    if (app.isPackaged) return { success: false, error: '正式版训练器由 Baka 组件管理器统一管理' }
    if (!folderPath || !fs.existsSync(path.join(folderPath, 'gui.py'))) {
      return { success: false, error: '所选目录不是有效的训练仓库' }
    }
    saveConfig({ repoPath: folderPath })
    return { success: true }
  })
  ipcMain.handle('runtime:systemInfo', () => ({ python: findPython(), git: findGit(), cuda: detectCUDA() }))
  ipcMain.handle('runtime:recommendation', async () => {
    if (app.isPackaged) return require('./component-manager').getComponentManager().recommendation()
    const repoRoot = getRepoRoot()
    if (!repoRoot) return { preferred_runtime_id: null, reason_zh: '训练器核心尚未就绪' }
    return runLauncherBridge(repoRoot, 'get_runtime_recommendation')
  })
  ipcMain.handle('runtime:health', async (_event, runtimeId) => {
    if (app.isPackaged) return managedRuntimeHealth(runtimeId)
    const repoRoot = getRepoRoot()
    if (!repoRoot) return { ok: false, error: '训练器核心尚未就绪' }
    try {
      return await runLauncherBridge(repoRoot, 'get_health_report', { runtime_id: runtimeId || null })
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })
  ipcMain.handle('runtime:install', async (_event, runtimeId) => {
    if (app.isPackaged) return require('./component-manager').getComponentManager().install(runtimeId)
    const repoRoot = getRepoRoot()
    return repoRoot ? installRuntime(repoRoot, runtimeId) : { success: false, error: '请先设置训练器目录' }
  })
  ipcMain.handle('runtime:cancelInstall', async () => requestInstallCancellation())
  ipcMain.handle('runtime:launch', async (_event, { runtimeId, port }) => {
    const repoRoot = getRepoRoot()
    if (!repoRoot) return { success: false, error: '请先设置训练器目录' }
    try {
      return await launchGUI(repoRoot, runtimeId, port || 28000)
    } catch (error) {
      emitRuntimeLog('error', error.message, runtimeId)
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('runtime:stop', () => stopGUI())
  ipcMain.handle('runtime:guiStatus', () => ({ running: guiProcess !== null }))
  ipcMain.handle('runtime:getConfig', () => loadConfig())
  ipcMain.handle('runtime:updateConfig', async (_event, partial) => saveConfig(partial))
  ipcMain.handle('runtime:distribution', () => getTrainerDistribution())
  ipcMain.handle('runtime:rollbackTrainer', () => {
    if (guiProcess || activeInstall) return { success: false, error: '训练器或环境正在运行，暂时不能切换版本' }
    const result = rollbackTrainer(app.getPath('userData'))
    if (!result) return { success: false, error: '没有可回退的训练器版本' }
    saveConfig({ repoPath: '' })
    return { success: true, ...result }
  })
  ipcMain.handle('runtime:autoClone', async () => {
    if (app.isPackaged) {
      const recommendation = await require('./component-manager').getComponentManager().recommendation()
      return require('./component-manager').getComponentManager().install(recommendation.preferred_runtime_id || 'standard')
    }
    const existing = getRepoRoot()
    if (existing) return { success: true, path: existing, message: '训练器已存在，跳过克隆' }
    const target = path.join(app.getPath('userData'), 'lora-rescripts')
    try {
      const cloned = await cloneRepo(target)
      saveConfig({ repoPath: cloned })
      return { success: true, path: cloned }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = {
  registerRuntimeManagerHandlers,
  runLauncherBridge,
  normalizeRuntimeStatus,
  requestInstallCancellation,
  isRuntimeBusy: () => !!(guiProcess || activeInstall),
}

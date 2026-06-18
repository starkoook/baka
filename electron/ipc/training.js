const { ipcMain } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

let trainingProcess = null
let guiPort = 28000

function getRepoPath() {
  const configPath = path.join(app.getPath('userData'), 'baka-config.json')
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return config.loraRescriptsPath || ''
    }
  } catch (_) {}
  return ''
}

function registerTrainingHandlers(mainWindow) {
  // Get status
  ipcMain.handle('training:status', async () => {
    const repoPath = getRepoPath()
    const hasRepo = repoPath && fs.existsSync(path.join(repoPath, 'gui.py'))
    return {
      running: trainingProcess !== null,
      guiPort,
      repoPath,
      hasRepo,
      url: trainingProcess ? `http://127.0.0.1:${guiPort}` : null,
    }
  })

  // Set repo path
  ipcMain.handle('training:setPath', async (_event, folderPath) => {
    const configPath = path.join(app.getPath('userData'), 'baka-config.json')
    try {
      const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {}
      config.loraRescriptsPath = folderPath
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Launch training GUI
  ipcMain.handle('training:launch', async () => {
    const repoPath = getRepoPath()
    if (!repoPath || !fs.existsSync(path.join(repoPath, 'gui.py'))) {
      return { success: false, error: '未找到 lora-rescripts 目录' }
    }

    if (trainingProcess) {
      return { success: true, alreadyRunning: true, url: `http://127.0.0.1:${guiPort}` }
    }

    try {
      // Try system python first, then bundled
      let usePython = 'python'
      const bundled = path.join(repoPath, 'python', 'python.exe')
      try {
        const { execSync } = require('child_process')
        execSync('python --version', { stdio: 'ignore', timeout: 3000 })
      } catch {
        if (fs.existsSync(bundled)) usePython = bundled
      }

      mainWindow?.webContents.send('training:log', { type: 'info', message: `启动: ${usePython} gui.py --port ${guiPort}` })
      mainWindow?.webContents.send('training:log', { type: 'info', message: `工作目录: ${repoPath}` })

      trainingProcess = spawn(usePython, ['gui.py', '--port', String(guiPort)], {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
        env: { ...process.env, MIKAZUKI_ALLOW_SYSTEM_PYTHON: '1' },
      })

      trainingProcess.on('error', (err) => {
        const msg = `进程启动失败: ${err.message}`
        mainWindow?.webContents.send('training:log', { type: 'error', message: msg })
        trainingProcess = null
        mainWindow?.webContents.send('training:statusChange', { running: false, error: msg })
        crashed = true
      })

      // Also capture spawn error immediately if the binary doesn't exist
      trainingProcess.once('spawn', () => {
        mainWindow?.webContents.send('training:log', { type: 'info', message: '进程已生成 (spawn OK)' })
      })

      trainingProcess.stdout?.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg) mainWindow?.webContents.send('training:log', { type: 'info', message: msg })
      })
      trainingProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg) mainWindow?.webContents.send('training:log', { type: 'error', message: msg })
      })

      let crashed = false
      trainingProcess.on('close', (code) => {
        crashed = trainingProcess !== null
        trainingProcess = null
        mainWindow?.webContents.send('training:log', { type: code === 0 ? 'info' : 'error', message: `训练器已退出 (code: ${code})` })
        mainWindow?.webContents.send('training:statusChange', { running: false, error: code !== 0 ? `exit code ${code}` : null })
      })

      // Wait and check if process is still alive
      await new Promise((resolve) => setTimeout(resolve, 3000))
      if (crashed || !trainingProcess) {
        return { success: false, error: '进程启动后立即退出。可能需要先安装依赖：运行 lora-rescripts 目录下的 install.ps1 或 install.bash' }
      }

      return { success: true, url: `http://127.0.0.1:${guiPort}` }
    } catch (e) {
      trainingProcess = null
      return { success: false, error: e.message }
    }
  })

  // Stop training GUI
  ipcMain.handle('training:stop', async () => {
    if (!trainingProcess) return { success: true }
    try {
      trainingProcess.kill()
      trainingProcess = null
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Clone lora-rescripts
  ipcMain.handle('training:clone', async () => {
    const repoPath = path.join(app.getPath('userData'), 'lora-rescripts')
    if (fs.existsSync(path.join(repoPath, 'gui.py'))) {
      return { success: true, path: repoPath, alreadyExists: true }
    }
    try {
      fs.mkdirSync(repoPath, { recursive: true })
      const proc = spawn('git', [
        'clone', '--recurse-submodules', '--depth', '1',
        'https://github.com/WhitecrowAurora/lora-rescripts.git', repoPath,
      ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })

      return new Promise((resolve) => {
        proc.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, path: repoPath })
          } else {
            resolve({ success: false, error: `Git clone failed with code ${code}` })
          }
        })
        proc.on('error', (err) => {
          resolve({ success: false, error: `Git not found: ${err.message}. Please install Git first.` })
        })
        // Timeout after 5 minutes
        setTimeout(() => {
          if (proc.exitCode === null) { proc.kill(); resolve({ success: false, error: 'Clone timeout' }) }
        }, 300000)
      })
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Check environment
  ipcMain.handle('training:checkEnv', async () => {
    const checks = {}
    // Check git
    try {
      const { execSync } = require('child_process')
      execSync('git --version', { stdio: 'ignore', timeout: 5000 })
      checks.git = true
    } catch { checks.git = false }

    // Check python
    try {
      const { execSync } = require('child_process')
      const r = execSync('python --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim()
      checks.python = r
    } catch { checks.python = null }

    // Check pip
    try {
      const { execSync } = require('child_process')
      const r = execSync('pip --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim()
      checks.pip = r
    } catch { checks.pip = null }

    return checks
  })
}

module.exports = { registerTrainingHandlers }

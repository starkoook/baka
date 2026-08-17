/**
 * Training HTTP Bridge — 代理 Electron → Python FastAPI 后端的 HTTP 调用
 *
 * baka-tools 的 Vue 前端通过 IPC 调用此桥接层，由 Electron 主进程转发到
 * Python Mikazuki 后端的 REST API（默认 http://127.0.0.1:28000）。
 *
 * 这样做的好处：
 * 1. 避免 CORS 问题 — 主进程不受同源策略限制
 * 2. 统一错误处理 — 后端未启动时给友好提示
 * 3. 解耦 — 前端不关心 HTTP 细节，改变后端地址只需改这里
 */

const { ipcMain } = require('electron')
const { compileTrainerSchemas } = require('../runtime/training-schema-runtime')

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:28000/api'

/** @type {string} */
let backendUrl = DEFAULT_BACKEND_URL

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

/**
 * 发起 HTTP 请求 （Electron 主进程侧的 fetch 是 Node 18+ 内置的，基于 undici）
 * @param {string} path - API 路径，例如 "/tasks"
 * @param {'GET'|'POST'|'DELETE'} method
 * @param {object|null} body - POST 时的 JSON body
 * @returns {Promise<{ok: boolean; status: number; data: any}>}
 */
async function fetchBackend(path, method = 'GET', body = null) {
  const url = `${backendUrl}${path}`
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body)
  }
  try {
    const res = await fetch(url, opts)
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED') {
      return { ok: false, status: 0, data: { error: '训练后端未启动，请先在「运行时管理」中启动训练器' } }
    }
    return { ok: false, status: 0, data: { error: `后端连接失败: ${err.message}` } }
  }
}

/**
 * 设置后端地址（当用户指定了非默认端口时）
 */
function setBackendUrl(url) {
  backendUrl = url.replace(/\/+$/, '') + '/api'
}

/**
 * 提交训练配置到后端
 * POST /api/run
 * @param {object} config - 训练配置 JSON（与 TOML 格式一一对应，扁平 key-value）
 */
async function submitTraining(config) {
  // 确保必要字段存在
  const payload = { ...config }
  if (!payload.model_train_type) {
    payload.model_train_type = 'sd-lora'
  }
  return fetchBackend('/run', 'POST', payload)
}

/**
 * 预检训练配置（不启动训练）
 * POST /api/train/preflight
 */
async function preflightTraining(config) {
  return fetchBackend('/train/preflight', 'POST', config)
}

/**
 * 获取所有任务
 * GET /api/tasks
 */
async function getTasks() {
  return fetchBackend('/tasks')
}

/**
 * 获取任务输出日志
 * GET /api/task_output/{taskId}?tail=50
 */
async function getTaskOutput(taskId, tail = 50) {
  return fetchBackend(`/task_output/${taskId}?tail=${tail}`)
}

/**
 * 停止训练任务
 * GET /api/tasks/terminate/{taskId}
 */
async function stopTask(taskId) {
  return fetchBackend(`/tasks/terminate/${taskId}`)
}

/**
 * 获取系统监控数据
 * GET /api/system_monitor
 */
async function getSystemMonitor() {
  return fetchBackend('/system_monitor')
}

/**
 * 获取 GPU 状态
 * GET /api/gpu_status
 */
async function getGpuStatus() {
  return fetchBackend('/gpu_status')
}

/**
 * 获取后端状态
 * GET /api/backend/status
 */
async function getBackendStatus() {
  return fetchBackend('/backend/status')
}

async function getSchemas() {
  const response = await fetchBackend('/schemas/all')
  const entries = response.data?.data?.schemas
  if (!response.ok || !Array.isArray(entries)) return response
  return { ok: true, status: response.status, data: compileTrainerSchemas(entries) }
}

async function getSchemaHashes() {
  return fetchBackend('/schemas/hashes')
}

async function getPresets() {
  return fetchBackend('/presets')
}

async function getScripts() {
  return fetchBackend('/scripts')
}

async function runScript(payload) {
  return fetchBackend('/run_script', 'POST', payload)
}

/**
 * 注册所有 IPC 处理器
 * @param {import('electron').BrowserWindow} win
 */
function registerTrainingHttpHandlers(win) {
  mainWindow = win

  // ── 训练提交 ──
  ipcMain.handle('thttp:submitTraining', async (_event, config) => {
    const res = await submitTraining(config)
    return res
  })

  // ── 训练预检 ──
  ipcMain.handle('thttp:preflight', async (_event, config) => {
    const res = await preflightTraining(config)
    return res
  })

  // ── 任务列表 ──
  ipcMain.handle('thttp:getTasks', async () => {
    const res = await getTasks()
    return res
  })

  // ── 任务输出 ──
  ipcMain.handle('thttp:getTaskOutput', async (_event, taskId, tail) => {
    const res = await getTaskOutput(taskId, tail || 50)
    return res
  })

  // ── 停止任务 ──
  ipcMain.handle('thttp:stopTask', async (_event, taskId) => {
    const res = await stopTask(taskId)
    return res
  })

  // ── 系统监控 ──
  ipcMain.handle('thttp:systemMonitor', async () => {
    const res = await getSystemMonitor()
    return res
  })

  // ── GPU 状态 ──
  ipcMain.handle('thttp:gpuStatus', async () => {
    const res = await getGpuStatus()
    return res
  })

  // ── 后端状态 ──
  ipcMain.handle('thttp:backendStatus', async () => {
    const res = await getBackendStatus()
    return res
  })

  ipcMain.handle('thttp:getSchemas', () => getSchemas())
  ipcMain.handle('thttp:getSchemaHashes', () => getSchemaHashes())
  ipcMain.handle('thttp:getPresets', () => getPresets())
  ipcMain.handle('thttp:getScripts', () => getScripts())
  ipcMain.handle('thttp:runScript', (_event, payload) => runScript(payload))
}

module.exports = {
  registerTrainingHttpHandlers,
  setBackendUrl,
  fetchBackend,
}

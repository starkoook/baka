const fs = require('fs')
const path = require('path')
const { ipcMain } = require('electron')

const MAX_ENTRIES = 2000
const MAX_FILE_BYTES = 2 * 1024 * 1024

let getMainWindow = () => null

function getLogDir() {
  const { getDataRoot } = require('./paths')
  const dir = path.join(getDataRoot(), 'logs')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getLogPath() {
  return path.join(getLogDir(), 'app.jsonl')
}

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function normalizeType(type) {
  if (type === 'error' || type === 'warn' || type === 'success' || type === 'info') return type
  if (type === 3 || type === '3') return 'error'
  if (type === 2 || type === '2') return 'warn'
  return 'info'
}

function writeAppLog(type, message, source) {
  const entry = {
    time: nowTime(),
    iso: new Date().toISOString(),
    type: normalizeType(type),
    message: String(message == null ? '' : message),
    source: String(source || 'app'),
  }
  try {
    const file = getLogPath()
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8')
    try {
      const st = fs.statSync(file)
      if (st.size > MAX_FILE_BYTES) {
        const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter(Boolean)
        const keep = lines.slice(-Math.floor(MAX_ENTRIES / 2))
        fs.writeFileSync(file, keep.join('\n') + '\n', 'utf-8')
      }
    } catch (_) {}
  } catch (_) {}
  try {
    const win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow
    if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
      win.webContents.send('log:entry', entry)
    }
  } catch (_) {}
  return entry
}

function readAppLog(limit) {
  try {
    const file = getLogPath()
    if (!fs.existsSync(file)) return []
    const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter(Boolean)
    return lines.slice(-(limit || 500)).map((line) => {
      try { return JSON.parse(line) } catch { return { time: '', type: 'info', message: line, source: 'file' } }
    })
  } catch (_) {
    return []
  }
}

function clearAppLog() {
  beginAppLogSession()
}

function beginAppLogSession(filePath) {
  const file = filePath || getLogPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '', 'utf-8')
  return file
}

function registerLogHandlers(getWin) {
  getMainWindow = typeof getWin === 'function' ? getWin : () => getWin
  ipcMain.handle('log:getHistory', async (_event, limit) => {
    return { success: true, data: { entries: readAppLog(limit || 500), path: getLogPath() } }
  })
  ipcMain.handle('log:clear', async () => {
    clearAppLog()
    return { success: true }
  })
  ipcMain.handle('log:append', async (_event, payload) => {
    const entry = writeAppLog(payload && payload.type, payload && payload.message, (payload && payload.source) || 'renderer')
    return { success: true, data: entry }
  })
  ipcMain.handle('log:path', async () => {
    return { success: true, data: { path: getLogPath() } }
  })
}

module.exports = { writeAppLog, readAppLog, clearAppLog, beginAppLogSession, getLogPath, registerLogHandlers }

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { getDataRoot } = require('./paths')

const RECENT_LIMIT = 20

function getWorkflowsDir(root = getDataRoot()) {
  const dir = path.join(root, 'workflows')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getAutosavePath(root) {
  return path.join(getWorkflowsDir(root), 'autosave.bakaflow.json')
}

function saveAutosave(content, root = getDataRoot()) {
  try {
    const file = getAutosavePath(root)
    fs.writeFileSync(file, content, 'utf-8')
    return { success: true, path: file }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

function loadAutosave(root = getDataRoot()) {
  const file = getAutosavePath(root)
  if (!fs.existsSync(file)) return { success: false, error: '没有自动保存' }
  try {
    return { success: true, content: fs.readFileSync(file, 'utf-8'), path: file }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

function getRecentPath(root) {
  return path.join(getWorkflowsDir(root), 'recent.json')
}

function listRecent(root = getDataRoot()) {
  try {
    const list = JSON.parse(fs.readFileSync(getRecentPath(root), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function recordRecent(entry, root = getDataRoot()) {
  const filePath = entry?.path
  if (!filePath) return { success: false, error: '没有文件路径' }
  const list = listRecent(root).filter((item) => item.path !== filePath)
  list.unshift({ path: filePath, name: entry.name || path.basename(filePath), updatedAt: Date.now() })
  const trimmed = list.slice(0, RECENT_LIMIT)
  fs.writeFileSync(getRecentPath(root), JSON.stringify(trimmed, null, 2), 'utf-8')
  return { success: true, list: trimmed }
}

function removeRecent(filePath, root = getDataRoot()) {
  const list = listRecent(root).filter((item) => item.path !== filePath)
  fs.writeFileSync(getRecentPath(root), JSON.stringify(list, null, 2), 'utf-8')
  return { success: true, list }
}

function registerWorkflowHandlers() {
  ipcMain.handle('workflow:saveAutosave', (_event, content) => saveAutosave(content))
  ipcMain.on('workflow:saveAutosaveSync', (event, content) => {
    event.returnValue = saveAutosave(content)
  })
  ipcMain.handle('workflow:loadAutosave', () => loadAutosave())
  ipcMain.handle('workflow:listRecent', () => ({ success: true, list: listRecent() }))
  ipcMain.handle('workflow:recordRecent', (_event, entry) => recordRecent(entry))
  ipcMain.handle('workflow:removeRecent', (_event, filePath) => removeRecent(filePath))
}

module.exports = {
  getWorkflowsDir,
  getAutosavePath,
  saveAutosave,
  loadAutosave,
  listRecent,
  recordRecent,
  removeRecent,
  registerWorkflowHandlers,
}

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { getDataRoot } = require('./paths')

const ASSET_LIMIT = 200

function getAssetsDir(root = getDataRoot()) {
  const dir = path.join(root, 'assets')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getIndexPath(root) {
  return path.join(getAssetsDir(root), 'index.json')
}

function getFilesDir(root) {
  const dir = path.join(getAssetsDir(root), 'files')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function listAssets(root = getDataRoot()) {
  try {
    const list = JSON.parse(fs.readFileSync(getIndexPath(root), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function addAsset(entry, root = getDataRoot()) {
  const { type, dataUrl, text, sourcePath, meta } = entry || {}
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  let file = ''
  if (type === 'image' && dataUrl) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl)
    if (!match) return { success: false, error: '无效图片数据' }
    const ext = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : match[1] === 'image/gif' ? 'gif' : 'jpg'
    file = path.join(getFilesDir(root), `${id}.${ext}`)
    fs.writeFileSync(file, Buffer.from(match[2], 'base64'))
  } else if (type === 'text') {
    file = path.join(getFilesDir(root), `${id}.txt`)
    fs.writeFileSync(file, text ?? '', 'utf-8')
  } else if (type === 'video' && sourcePath) {
    file = sourcePath
  } else {
    return { success: false, error: '缺少资产内容' }
  }
  const record = { id, type, file, meta: meta || {}, createdAt: Date.now() }
  const next = [record, ...listAssets(root)].slice(0, ASSET_LIMIT)
  fs.writeFileSync(getIndexPath(root), JSON.stringify(next, null, 2), 'utf-8')
  return { success: true, asset: record }
}

function deleteAsset(id, root = getDataRoot()) {
  const list = listAssets(root)
  const found = list.find((item) => item.id === id)
  const next = list.filter((item) => item.id !== id)
  fs.writeFileSync(getIndexPath(root), JSON.stringify(next, null, 2), 'utf-8')
  if (found && found.file && found.file.startsWith(getFilesDir(root))) {
    try { fs.unlinkSync(found.file) } catch { /* 文件可能已不存在 */ }
  }
  return { success: true, list: next }
}

function clearAssets(root = getDataRoot()) {
  fs.writeFileSync(getIndexPath(root), '[]', 'utf-8')
  return { success: true }
}

function registerAssetHandlers() {
  ipcMain.handle('assets:list', () => ({ success: true, list: listAssets() }))
  ipcMain.handle('assets:add', (_event, entry) => addAsset(entry))
  ipcMain.handle('assets:delete', (_event, id) => deleteAsset(id))
  ipcMain.handle('assets:clear', () => clearAssets())
}

module.exports = {
  getAssetsDir,
  listAssets,
  addAsset,
  deleteAsset,
  clearAssets,
  registerAssetHandlers,
}

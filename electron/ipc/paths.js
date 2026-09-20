/**
 * Centralised storage paths for Baka TOOLS.
 * 数据目录放在安装目录旁边（如 D:\baka\BakaTOOLS-data），
 * 不能放在安装目录里面——覆盖安装/卸载会把安装目录整个删除。
 * 老版本 D:\BakaTOOLS 的数据会在首次启动时自动迁移过来。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const LEGACY_DATA_ROOT = 'D:\\BakaTOOLS'
const APP_DATA_DIR = 'app-data'

function defaultInstallDataRoot() {
  if (!process.defaultApp && process.resourcesPath) {
    // 已安装版本：安装目录的同级「-data」文件夹（卸载/覆盖安装不会碰它）
    const installDir = path.dirname(process.resourcesPath)
    const inside = path.join(installDir, 'BakaTOOLS-data')
    const sibling = installDir + '-data'
    if (fs.existsSync(inside)) return inside
    if (fs.existsSync(sibling)) return sibling
    return inside
  }
  // 开发模式：优先复用已安装版本的数据目录，保持一致
  const inside = 'D:\\baka\\BakaTOOLS\\BakaTOOLS-data'
  const sibling = 'D:\\baka\\BakaTOOLS-data'
  if (fs.existsSync(inside)) return inside
  if (fs.existsSync(sibling)) return sibling
  return path.join(__dirname, '..', '..', APP_DATA_DIR)
}

function resolveDataRoot({
  legacyRoot = LEGACY_DATA_ROOT,
  appDataRoot = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  exists = fs.existsSync,
  installRoot = defaultInstallDataRoot(),
} = {}) {
  if (process.env.BAKA_DATA_ROOT) return process.env.BAKA_DATA_ROOT
  return installRoot
}

let dataRootCache = null

function getDataRoot() {
  if (!dataRootCache) dataRootCache = resolveDataRoot()
  ensure(dataRootCache)
  return dataRootCache
}

function getDefaultDataRoot() {
  return resolveDataRoot()
}

function migrateLegacyData({
  legacyRoot = LEGACY_DATA_ROOT,
  targetRoot = getDataRoot(),
  exists = fs.existsSync,
  readdir = fs.readdirSync,
  rename = fs.renameSync,
  rmdir = fs.rmdirSync,
  mkdir = fs.mkdirSync,
} = {}) {
  if (!targetRoot || targetRoot === legacyRoot) return false
  if (!exists(legacyRoot)) return false
  if (exists(targetRoot)) {
    try {
      if (readdir(targetRoot).length > 0) return false
      rmdir(targetRoot)
    } catch {
      return false
    }
  }
  try {
    mkdir(path.dirname(targetRoot), { recursive: true })
    rename(legacyRoot, targetRoot)
    return true
  } catch {
    return false
  }
}

function ensure(dir) {
  if (fs.existsSync(dir)) {
    // It exists — but make sure it's actually a directory
    try {
      const stat = fs.statSync(dir)
      if (!stat.isDirectory()) {
        // It's a file! Remove it and create the directory
        fs.unlinkSync(dir)
        fs.mkdirSync(dir, { recursive: true })
      }
    } catch (_) {
      fs.mkdirSync(dir, { recursive: true })
    }
  } else {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function getDbDir() {
  const dir = path.join(getDataRoot(), 'data'); ensure(dir); return dir
}
function getDbPath(root = getDataRoot()) {
  const dir = path.join(root, 'data'); ensure(dir)
  return path.join(dir, 'gallery.db')
}

function getThumbDir() {
  const dir = path.join(getDataRoot(), 'thumbnails'); ensure(dir); return dir
}

function getModelDir() {
  const dir = path.join(getDataRoot(), 'tagger-models'); ensure(dir); return dir
}

function getConfigPath() {
  return path.join(getDataRoot(), 'baka-config.json')
}

function getCredentialsPath() {
  return path.join(getDataRoot(), 'credentials.json')
}

function getRecycleDir(root = getDataRoot()) {
  const dir = path.join(root, 'recycle-bin'); ensure(dir); return dir
}

function getHistoryDir(root = getDataRoot()) {
  const dir = path.join(root, 'file-history'); ensure(dir); return dir
}

module.exports = {
  resolveDataRoot,
  getDefaultDataRoot,
  getDataRoot,
  migrateLegacyData,
  getDbDir,
  getDbPath,
  getThumbDir,
  getModelDir,
  getConfigPath,
  getCredentialsPath,
  getRecycleDir,
  getHistoryDir,
}

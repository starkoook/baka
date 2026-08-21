/**
 * Centralised storage paths for Baka TOOLS.
 * Existing D:\BakaTOOLS data is preserved; new installs use the system app-data directory.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const LEGACY_DATA_ROOT = 'D:\\BakaTOOLS'

function joinDataPath(root, name) {
  const value = String(root || '')
  const windowsStyle = /\\/.test(value) || /^[A-Za-z]:/.test(value)
  if (windowsStyle) return value.replace(/[\\/]+$/, '') + '\\' + name
  return path.join(value, name)
}

function resolveDataRoot({
  legacyRoot = LEGACY_DATA_ROOT,
  appDataRoot = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  exists = fs.existsSync,
} = {}) {
  if (process.env.BAKA_DATA_ROOT) return process.env.BAKA_DATA_ROOT
  if (exists(legacyRoot)) return legacyRoot
  return joinDataPath(appDataRoot, 'BakaTOOLS')
}

const DATA_ROOT = resolveDataRoot()

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

function getDataRoot() { ensure(DATA_ROOT); return DATA_ROOT }

function getDbDir() {
  const dir = path.join(DATA_ROOT, 'data'); ensure(dir); return dir
}
function getDbPath(root = DATA_ROOT) {
  const dir = path.join(root, 'data'); ensure(dir)
  return path.join(dir, 'gallery.db')
}

function getThumbDir() {
  const dir = path.join(DATA_ROOT, 'thumbnails'); ensure(dir); return dir
}

function getModelDir() {
  const dir = path.join(DATA_ROOT, 'tagger-models'); ensure(dir); return dir
}

function getConfigPath() {
  ensure(DATA_ROOT)
  return path.join(DATA_ROOT, 'baka-config.json')
}

function getCredentialsPath() {
  ensure(DATA_ROOT)
  return path.join(DATA_ROOT, 'credentials.json')
}

function getRecycleDir(root = DATA_ROOT) {
  const dir = path.join(root, 'recycle-bin'); ensure(dir); return dir
}

function getHistoryDir(root = DATA_ROOT) {
  const dir = path.join(root, 'file-history'); ensure(dir); return dir
}

module.exports = {
  resolveDataRoot,
  getDataRoot,
  getDbDir,
  getDbPath,
  getThumbDir,
  getModelDir,
  getConfigPath,
  getCredentialsPath,
  getRecycleDir,
  getHistoryDir,
}

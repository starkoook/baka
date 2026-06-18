/**
 * Centralised storage paths for Baka TOOLS.
 * All persistent data lives under D:\BakaTOOLS\ — NOT on C: drive.
 */
const fs = require('fs')
const path = require('path')

const DATA_ROOT = 'D:\\BakaTOOLS'

// Ensure root exists at module load time (before any DB operations)
try {
  if (!fs.existsSync(DATA_ROOT)) {
    fs.mkdirSync(DATA_ROOT, { recursive: true })
  }
} catch (e) {
  console.error(`[paths] Cannot create data root ${DATA_ROOT}: ${e.message}`)
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

function getDataRoot() { ensure(DATA_ROOT); return DATA_ROOT }

function getDbDir() {
  const dir = path.join(DATA_ROOT, 'data'); ensure(dir); return dir
}
function getDbPath() {
  const dir = getDbDir()
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

module.exports = { getDataRoot, getDbDir, getDbPath, getThumbDir, getModelDir, getConfigPath }

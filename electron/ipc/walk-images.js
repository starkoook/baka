const fs = require('fs')
const path = require('path')

const DEFAULT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function collectImageEntries(root, options = {}) {
  const {
    readdir = (dir) => fs.promises.readdir(dir, { withFileTypes: true }),
    stat = (file) => fs.promises.stat(file),
    yieldEvery = 40,
    yieldFn = yieldToEventLoop,
    extensions = DEFAULT_EXTENSIONS,
    joinPath = path.join,
    extname = path.extname,
  } = options

  const entries = []
  let seen = 0

  async function walk(dir) {
    let dirents
    try {
      dirents = await readdir(dir)
    } catch (_) {
      return
    }
    for (const item of dirents) {
      const full = joinPath(dir, item.name)
      if (item.isDirectory()) {
        await walk(full)
      } else if (extensions.has(extname(item.name).toLowerCase())) {
        try {
          const info = await stat(full)
          entries.push({
            path: full,
            filename: item.name,
            dirname: dir,
            size: info.size,
            mtime: info.mtime.toISOString(),
          })
        } catch (_) {}
      }
      seen += 1
      if (yieldEvery > 0 && seen % yieldEvery === 0) await yieldFn()
    }
  }

  await walk(root)
  return entries
}

module.exports = { collectImageEntries, yieldToEventLoop, DEFAULT_EXTENSIONS }

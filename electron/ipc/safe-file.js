const fs = require('fs')
const path = require('path')

const locks = new Map()

function lockKey(target) {
  return path.resolve(String(target || ''))
}

async function withLock(target, action) {
  const key = lockKey(target)
  const previous = locks.get(key) || Promise.resolve()
  let release
  const current = new Promise((resolve) => { release = resolve })
  locks.set(key, current)
  await previous
  try {
    return await action()
  } finally {
    release()
    if (locks.get(key) === current) locks.delete(key)
  }
}

async function writeTemp(target, content) {
  const dir = path.dirname(target)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.bdtm-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`)
  if (typeof content === 'string') fs.writeFileSync(tmp, content, 'utf8')
  else fs.writeFileSync(tmp, content)
  return tmp
}

async function replaceFile(tmp, target) {
  fs.copyFileSync(tmp, target)
  fs.rmSync(tmp, { force: true })
}

async function writeTextSafe(target, text) {
  return withLock(target, async () => {
    const tmp = await writeTemp(target, text)
    try {
      await replaceFile(tmp, target)
      return { success: true }
    } catch (error) {
      try { fs.rmSync(tmp, { force: true }) } catch {}
      return { success: false, error: error.message }
    }
  })
}

async function writeBytesSafe(target, buffer) {
  return withLock(target, async () => {
    const tmp = await writeTemp(target, buffer)
    try {
      await replaceFile(tmp, target)
      return { success: true }
    } catch (error) {
      try { fs.rmSync(tmp, { force: true }) } catch {}
      return { success: false, error: error.message }
    }
  })
}

module.exports = { writeTextSafe, writeBytesSafe }

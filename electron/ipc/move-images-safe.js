const fs = require('fs')
const path = require('path')

async function moveImages({ filePaths, destFolder, keepOriginal, failAt = null }) {
  fs.mkdirSync(destFolder, { recursive: true })
  const results = []
  const failures = []
  for (const src of filePaths) {
    if (failAt && src === failAt) {
      failures.push({ path: src, error: 'simulated failure' })
      continue
    }
    let imageMoved = false
    let finalDest = null
    try {
      const filename = path.basename(src)
      finalDest = path.join(destFolder, filename)
      let n = 1
      while (fs.existsSync(finalDest)) {
        const ext = path.extname(filename)
        finalDest = path.join(destFolder, `${filename.slice(0, -ext.length)}_${n}${ext}`)
        n++
      }
      const captionSrc = src.replace(/\.[^.]+$/, '') + '.txt'
      const captionDest = finalDest.replace(/\.[^.]+$/, '') + '.txt'
      if (keepOriginal) {
        fs.copyFileSync(src, finalDest)
        if (fs.existsSync(captionSrc)) fs.copyFileSync(captionSrc, captionDest)
      } else {
        fs.renameSync(src, finalDest)
        imageMoved = true
        if (fs.existsSync(captionSrc)) {
          fs.renameSync(captionSrc, captionDest)
        }
      }
      results.push({ oldPath: src, newPath: finalDest })
    } catch (error) {
      if (imageMoved && finalDest) {
        try { fs.renameSync(finalDest, src) } catch {}
      }
      failures.push({ path: src, error: error.message })
    }
  }
  return { success: failures.length === 0, data: { moved: results.length, destPaths: results.map(r => r.newPath), results, failures } }
}

module.exports = { moveImages }

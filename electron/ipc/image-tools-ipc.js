const fs = require('fs')
const path = require('path')
const { ipcMain } = require('electron')
const {
  editImage,
  findSimilarImages,
  removeBackground,
  removeBackgroundAi,
  replaceTransparentBackground,
  scanBadImages,
} = require('./image-tools')
const { getModelDir } = require('./paths')

function base64AndPath(buffer, outputPath) {
  return {
    base64: buffer.toString('base64'),
    outputPath: outputPath || '',
  }
}

function ensureOutputPath(inputPath, outputPath, suffix) {
  if (outputPath) return outputPath
  const ext = path.extname(inputPath)
  return path.join(path.dirname(inputPath), `${path.basename(inputPath, ext)}${suffix}${ext || '.png'}`)
}

function registerImageToolsHandlers() {
  ipcMain.handle('imageTools:removeBackground', async (_event, params = {}) => {
    try {
      const outputPath = params.outputPath || ensureOutputPath(params.inputPath, '', '-bg-removed')
      const result = await removeBackground(params.inputPath, {
        tolerance: params.tolerance,
        feather: params.feather,
        outputPath,
      })
      return { success: true, data: { ...base64AndPath(result.buffer, outputPath), width: result.width, height: result.height } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('imageTools:replaceTransparentBackground', async (_event, params = {}) => {
    try {
      const outputPath = params.outputPath || ensureOutputPath(params.inputPath, '', '-flat')
      const result = await replaceTransparentBackground(params.inputPath, {
        color: params.color || '#ffffff',
        outputPath,
      })
      return { success: true, data: { ...base64AndPath(result.buffer, outputPath), width: result.width, height: result.height } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('imageTools:edit', async (_event, params = {}) => {
    try {
      const outputPath = params.outputPath || ensureOutputPath(params.inputPath, '', '-edited')
      const result = await editImage(params.inputPath, params.operation || {}, outputPath)
      return { success: true, data: { ...base64AndPath(result.buffer, outputPath), width: result.width, height: result.height } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('imageTools:similar', async (_event, params = {}) => {
    try {
      const data = await findSimilarImages(params.paths || [], { threshold: params.threshold ?? 8 })
      return { success: true, data }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('imageTools:badScan', async (_event, params = {}) => {
    try {
      const data = await scanBadImages(params.paths || [])
      return { success: true, data: { results: data } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('imageTools:removeBackgroundAi', async (_event, params = {}) => {
    try {
      const modelPath = params.modelPath || path.join(getModelDir(), 'rmbg-1.4.onnx')
      const outputPath = params.outputPath || ensureOutputPath(params.inputPath, '', '-bg-removed-ai')
      const result = await removeBackgroundAi(params.inputPath, { modelPath, outputPath })
      return { success: true, data: { ...base64AndPath(result.buffer, outputPath), width: result.width, height: result.height } }
    } catch (e) {
      return { success: false, error: e.message || String(e) }
    }
  })

  ipcMain.handle('imageTools:getAiModelInfo', async () => {
    const modelPath = path.join(getModelDir(), 'rmbg-1.4.onnx')
    return { success: true, data: { modelPath, installed: fs.existsSync(modelPath) } }
  })

  ipcMain.handle('imageTools:downloadAiModel', async (event) => {
    const modelPath = path.join(getModelDir(), 'rmbg-1.4.onnx')
    if (!fs.existsSync(path.dirname(modelPath))) fs.mkdirSync(path.dirname(modelPath), { recursive: true })
    const url = 'https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx'
    const sendProgress = (received, total) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('imageTools:downloadAiProgress', { received, total })
      }
    }
    try {
      await downloadFile(url, modelPath, sendProgress)
      return { success: true, data: { modelPath } }
    } catch (error) {
      try { fs.unlinkSync(modelPath) } catch (_) {}
      return { success: false, error: error.message || String(error) }
    }
  })
}

function downloadFile(url, destPath, onProgress) {
  const https = require('https')
  const follow = (currentUrl) => new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https.get(currentUrl, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close()
        try { fs.unlinkSync(destPath) } catch (_) {}
        resolve(follow(new URL(response.headers.location, currentUrl).toString()))
        return
      }
      if (response.statusCode !== 200) {
        file.close()
        try { fs.unlinkSync(destPath) } catch (_) {}
        reject(new Error(`下载失败（HTTP ${response.statusCode}）`))
        return
      }
      const total = Number(response.headers['content-length'] || 0)
      let received = 0
      response.on('data', (chunk) => {
        received += chunk.length
        onProgress?.(received, total)
      })
      response.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    }).on('error', reject)
  })
  return follow(url)
}

module.exports = { registerImageToolsHandlers }

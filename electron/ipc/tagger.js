const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

// Config path for local model settings
function getLocalModelDir() {
  const configPath = require('./paths').getConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return config.localModelDir || ''
    }
  } catch (_) {}
  return ''
}

// Singleton: cached ONNX session + labels
let ortSession = null
let tagLabels = null
let loadedModelPath = ''

function loadCsvLabels(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf-8')
  const lines = raw.split('\n')
  // WD14 CSV format: tag_id,name,category,count
  // or simpler: just name per line
  if (lines[0]?.includes(',')) {
    return lines.slice(1).map((l) => l.split(',')[1]?.trim()).filter(Boolean)
  }
  return lines.map((l) => l.trim()).filter(Boolean)
}

async function preprocessImage(imagePath) {
  const sharp = require('sharp')
  const buffer = await sharp(imagePath)
    .resize(448, 448, { fit: 'inside', position: 'center', background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer()

  const float32 = new Float32Array(448 * 448 * 3)
  for (let i = 0; i < float32.length; i++) {
    float32[i] = buffer[i] / 255.0
  }

  // ONNX tensor shape: [1, 3, 448, 448]
  const ort = require('onnxruntime-node')
  const tensor = new ort.Tensor('float32', float32, [1, 3, 448, 448])
  return tensor
}

async function localInfer(imagePath, threshold = 0.25) {
  const ort = require('onnxruntime-node')
  const modelDir = getLocalModelDir()

  if (!modelDir) {
    throw new Error('请在设置中配置本地模型目录')
  }

  const modelPath = path.join(modelDir, 'wd-v1-4-moat-tagger.onnx')
  const csvPath = path.join(modelDir, 'wd-v1-4-moat-tagger.csv')

  if (!fs.existsSync(modelPath)) {
    throw new Error(`模型文件未找到: ${modelPath}\n请将 WD14 ONNX 模型放入本地模型目录`)
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`标签映射文件未找到: ${csvPath}`)
  }

  // Load model once (singleton cache)
  if (!ortSession || loadedModelPath !== modelPath) {
    ortSession = await ort.InferenceSession.create(modelPath)
    tagLabels = loadCsvLabels(csvPath)
    loadedModelPath = modelPath
  }

  // Preprocess image
  const imageTensor = await preprocessImage(imagePath)

  // Run inference
  const feeds = { [ortSession.inputNames[0]]: imageTensor }
  const outputMap = await ortSession.run(feeds)
  const probabilities = outputMap[ortSession.outputNames[0]].data

  // Filter by threshold
  const tags = []
  for (let i = 0; i < probabilities.length; i++) {
    if (probabilities[i] >= threshold && tagLabels[i]) {
      tags.push(tagLabels[i])
    }
  }

  return tags
}

function registerTaggerHandlers() {
  ipcMain.handle('tagger:local-infer', async (_event, { imagePath, threshold }) => {
    try {
      const tags = await localInfer(imagePath, threshold || 0.25)
      return { success: true, tags }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerTaggerHandlers }

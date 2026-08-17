const fs = require('fs')
const path = require('path')
const { getConfigPath, getModelDir } = require('./paths')

// SI-style model profiles with preprocessing configs
// input_layout: 'nhwc' (WD14) or 'nchw' (Camie/PixAI)
// normalization: 'wd14_bgr' (RGB->BGR), 'imagenet' (div255+mean/std), 'minus_one_to_one'
// output_activation: 'identity' or 'sigmoid'
const KNOWN_MODELS = {
  'wd-eva02-large-tagger-v3': { quality: 'high', speed: 'slow', memoryMb: 4096, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-swinv2-tagger-v3': { quality: 'high', speed: 'normal', memoryMb: 3072, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-convnext-tagger-v3': { quality: 'medium', speed: 'fast', memoryMb: 2048, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-vit-tagger-v3': { quality: 'medium', speed: 'fast', memoryMb: 1536, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-vit-large-tagger-v3': { quality: 'high', speed: 'normal', memoryMb: 3072, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-v1-4-moat-tagger': { quality: 'medium', speed: 'normal', memoryMb: 2048, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-v1-4-moat-tagger-v2': { quality: 'high', speed: 'normal', memoryMb: 2560, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-v1-4-swinv2-tagger-v2': { quality: 'high', speed: 'normal', memoryMb: 2560, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-v1-4-convnext-tagger-v2': { quality: 'medium', speed: 'fast', memoryMb: 1536, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-v1-4-convnextv2-tagger-v2': { quality: 'medium', speed: 'fast', memoryMb: 1536, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'wd-v1-4-vit-tagger-v2': { quality: 'medium', speed: 'fast', memoryMb: 1024, resolution: 448, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'camie-tagger-v2': { quality: 'medium', speed: 'normal', memoryMb: 2048, resolution: 448, inputLayout: 'nchw', normalization: 'imagenet', outputActivation: 'sigmoid', resizeMode: 'letterbox', padColor: [124,116,104], defaultThreshold: 0.62, characterThreshold: 0.78, maxTags: 65 },
  'pixai-tagger-v0.9': { quality: 'medium', speed: 'normal', memoryMb: 2048, resolution: 448, inputLayout: 'nchw', normalization: 'minus_one_to_one', outputActivation: 'identity', resizeMode: 'stretch', padColor: [255,255,255], defaultThreshold: 0.45, characterThreshold: 0.85, maxTags: 65 },
  'oppai-oracle-v1.1': { quality: 'high', speed: 'fast', memoryMb: 1536, resolution: 448, inputLayout: 'nchw', normalization: 'imagenet', outputActivation: 'sigmoid', resizeMode: 'letterbox', padColor: [114,114,114], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
  'deepdanbooru': { quality: 'low', speed: 'fast', memoryMb: 1024, resolution: 512, inputLayout: 'nhwc', normalization: 'wd14_bgr', outputActivation: 'identity', resizeMode: 'letterbox', padColor: [255,255,255], defaultThreshold: 0.35, characterThreshold: 0.85, maxTags: 50 },
}

const DOWNLOADABLE_MODELS = [
  { id: 'wd-v1-4-vit-tagger-v2', name: 'WD14 ViT v2（快、体积小）', repo: 'SmilingWolf/wd-v1-4-vit-tagger-v2' },
  { id: 'wd-v1-4-convnext-tagger-v2', name: 'WD14 ConvNext v2（较快）', repo: 'SmilingWolf/wd-v1-4-convnext-tagger-v2' },
  { id: 'wd-v1-4-convnextv2-tagger-v2', name: 'WD14 ConvNextV2 v2（较快）', repo: 'SmilingWolf/wd-v1-4-convnextv2-tagger-v2' },
  { id: 'wd-v1-4-swinv2-tagger-v2', name: 'WD14 SwinV2 v2（质量高）', repo: 'SmilingWolf/wd-v1-4-swinv2-tagger-v2' },
  { id: 'wd-swinv2-tagger-v3', name: 'WD SwinV2 v3（质量高）', repo: 'SmilingWolf/wd-swinv2-tagger-v3' },
  { id: 'wd-convnext-tagger-v3', name: 'WD ConvNext v3（较快）', repo: 'SmilingWolf/wd-convnext-tagger-v3' },
]

function matchKnownModel(filename) {
  const base = path.basename(filename, path.extname(filename)).toLowerCase()
  for (const [key, meta] of Object.entries(KNOWN_MODELS)) {
    if (base.includes(key)) return meta
  }
  return null
}

/** Fixed default model directory on D: drive — created automatically if missing. */
function getDefaultModelDir() { return getModelDir() }

function getModelDirFromConfig() {
  // Check config first, fall back to D:\BakaTOOLS\tagger-models\
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'))
    if (config.localModelDir && fs.existsSync(config.localModelDir)) return config.localModelDir
  } catch (_) {}
  return getDefaultModelDir()
}

/** Copy a file into the model directory. Returns the new path. */
function importModelFile(sourcePath) {
  const destDir = getDefaultModelDir()
  const filename = path.basename(sourcePath)
  const destPath = path.join(destDir, filename)
  if (sourcePath !== destPath) {
    fs.copyFileSync(sourcePath, destPath)
  }
  return destPath
}

function scanModels(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return []
  let files
  try {
    files = fs.readdirSync(dirPath)
  } catch (_) {
    return []
  }

  const onnxFiles = files.filter((f) => f.toLowerCase().endsWith('.onnx'))
  const csvFiles = new Set(files.filter((f) => f.toLowerCase().endsWith('.csv')))

  return onnxFiles.map((f) => {
    const base = f.replace(/\.onnx$/i, '')
    // Find matching CSV: base.csv or any CSV starting with base
    let csvPath = null
    if (csvFiles.has(base + '.csv')) {
      csvPath = path.join(dirPath, base + '.csv')
    } else {
      // Try prefix match
      for (const csv of csvFiles) {
        if (csv.toLowerCase().startsWith(base.toLowerCase())) {
          csvPath = path.join(dirPath, csv)
          break
        }
      }
    }

    const known = matchKnownModel(f)
    return {
      name: base,
      path: path.join(dirPath, f),
      csvPath,
      resolution: known ? known.resolution : 448,
      quality: known ? known.quality : 'unknown',
      speed: known ? known.speed : 'unknown',
      memoryMb: known ? known.memoryMb : 2048,
      provider: 'cpu',
      inputLayout: known ? known.inputLayout : 'nhwc',
      normalization: known ? known.normalization : 'wd14_bgr',
      outputActivation: known ? known.outputActivation : 'identity',
      resizeMode: known ? known.resizeMode : 'letterbox',
      padColor: known ? known.padColor : [255,255,255],
      defaultThreshold: known ? known.defaultThreshold : 0.35,
      characterThreshold: known ? known.characterThreshold : 0.85,
      maxTags: known ? known.maxTags : 50,
    }
  })
}

/**
 * Detect available ONNX execution providers.
 * Returns ordered list by preference.
 */
function detectProviders() {
  try {
    const ort = require('onnxruntime-node')
    const available = ort.env.executionProviders || []
    // Order by preference: CUDA > DML > CPU
    const preferred = ['cuda', 'dml', 'coreml', 'cpu']
    return preferred.filter((p) => available.includes(p))
  } catch (_) {
    return ['cpu']
  }
}

/**
 * Get GPU info via nvidia-smi (Windows) or fallback.
 */
function getGpuInfo() {
  try {
    const { execSync } = require('child_process')
    const out = execSync(
      'nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader,nounits',
      { timeout: 5000, encoding: 'utf-8', windowsHide: true }
    ).trim()
    const parts = out.split(',').map((s) => s.trim())
    return {
      name: parts[0] || 'NVIDIA GPU',
      vramTotalMb: parseFloat(parts[1]) || 0,
      vramUsedMb: parseFloat(parts[2]) || 0,
      provider: 'cuda',
    }
  } catch (_) {
    return { name: 'CPU', vramTotalMb: 0, vramUsedMb: 0, provider: 'cpu' }
  }
}

function registerModelHandlers() {
  const { ipcMain } = require('electron')

  ipcMain.handle('taggerV2:listModels', async () => {
    try {
      const dirPath = getModelDirFromConfig()
      const models = scanModels(dirPath)
      const providers = detectProviders()
      return { success: true, data: { models, providers } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('taggerV2:gpuInfo', async () => {
    try {
      const gpu = getGpuInfo()
      const providers = detectProviders()
      return { success: true, data: { gpu, providers } }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('taggerV2:setModelDir', async (_event, dirPath) => {
    try {
      const configPath = getConfigPath()
      let config = {}
      if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      config.localModelDir = dirPath
      const dir = path.dirname(configPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('taggerV2:getModelDir', async () => {
    try {
      const dir = getModelDirFromConfig()
      return { success: true, data: { dir, isDefault: dir === getDefaultModelDir() } }
    } catch (e) { return { success: false, error: e.message } }
  })

  // Import .onnx / .csv file into the models folder
  ipcMain.handle('taggerV2:importModel', async (_event, filePath) => {
    try {
      const ext = path.extname(filePath).toLowerCase()
      if (!['.onnx', '.csv'].includes(ext)) return { success: false, error: '只支持 .onnx 和 .csv 文件' }
      const dest = importModelFile(filePath)
      // Re-scan and return updated models
      const dirPath = getModelDirFromConfig()
      const models = scanModels(dirPath)
      return { success: true, data: { dest, models } }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('taggerV2:openModelDir', async () => {
    try {
      const { shell } = require('electron')
      shell.openPath(getDefaultModelDir())
      return { success: true }
    } catch (e) { return { success: false, error: e.message } }
  })

  ipcMain.handle('taggerV2:listDownloadableModels', async () => {
    const dirPath = getDefaultModelDir()
    return {
      success: true,
      data: DOWNLOADABLE_MODELS.map((model) => ({
        ...model,
        installed: fs.existsSync(path.join(dirPath, `${model.id}.onnx`)),
      })),
    }
  })

  ipcMain.handle('taggerV2:downloadModel', async (event, modelId) => {
    const model = DOWNLOADABLE_MODELS.find((item) => item.id === modelId)
    if (!model) return { success: false, error: '没有找到这个可下载模型。' }
    const dirPath = getDefaultModelDir()
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })

    const sendProgress = (received, total) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('taggerV2:downloadProgress', { modelId, received, total })
      }
    }

    const onnxUrl = `https://huggingface.co/${model.repo}/resolve/main/model.onnx`
    const csvUrl = `https://huggingface.co/${model.repo}/resolve/main/selected_tags.csv`
    const onnxPath = path.join(dirPath, `${model.id}.onnx`)
    const csvPath = path.join(dirPath, `${model.id}.csv`)

    try {
      await downloadFile(onnxUrl, onnxPath, sendProgress)
      sendProgress(1, 1)
      try { await downloadFile(csvUrl, csvPath, () => {}) } catch (_) {}
      return { success: true, data: { dirPath, models: scanModels(dirPath) } }
    } catch (error) {
      try { fs.unlinkSync(onnxPath) } catch (_) {}
      return { success: false, error: error.message }
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

module.exports = { registerModelHandlers, scanModels, detectProviders, getGpuInfo, downloadFile }

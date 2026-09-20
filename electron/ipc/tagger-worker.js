/**
 * Tagger Worker Process
 * Runs ONNX inference in isolation via child_process.fork().
 * Communication: process.send({type, ...}) / process.on('message', ...)
 *
 * Commands:
 *   {cmd:'init', modelPath, csvPath, resolution, providers}
 *   {cmd:'infer', imagePaths[], threshold, batchSize?}
 *   {cmd:'cancel'}
 *   {cmd:'shutdown'}
 *
 * Worker sends:
 *   {type:'ready'}
 *   {type:'progress', completed, total, currentFile}
 *   {type:'complete', results: [{path, tags, error?}]}
 *   {type:'error', message}
 *   {type:'cancelled', results}
 */
const fs = require('fs')
const path = require('path')

function addModuleSearchPath(dir) {
  if (!dir) return
  try { if (!fs.existsSync(dir)) return } catch (_) { return }
  if (!module.paths.includes(dir)) module.paths.unshift(dir)
}

;(function hydrateWorkerModulePaths() {
  const here = __dirname
  if (here.includes('app.asar.unpacked')) {
    const unpackedRoot = path.resolve(here, '..', '..')
    const asarRoot = unpackedRoot.replace('app.asar.unpacked', 'app.asar')
    addModuleSearchPath(path.join(unpackedRoot, 'node_modules'))
    addModuleSearchPath(path.join(asarRoot, 'node_modules'))
  }
})()


const CPU_FALLBACK_LOG = "GPU 超时（DirectML），已改用 CPU 继续标注"

function isDmlTdrError(err) {
  const text = [
    err && err.message,
    err && err.stack,
    err && err.code,
    typeof err === 'string' ? err : '',
  ].filter(Boolean).join(' ')
  const upper = String(text).toUpperCase()
  return (
    upper.includes('887A0005') ||
    upper.includes('887A0006') ||
    upper.includes('DEVICE_REMOVED') ||
    upper.includes('DEVICE_HUNG') ||
    upper.includes('DMLCOMMANDRECORDER') ||
    upper.includes('DXGI_ERROR_DEVICE')
  )
}

function reportFatal(err) {
  const message = (err && err.stack) || (err && err.message) || String(err)
  try { process.stderr.write('[tagger-worker] ' + message + '\n') } catch (_) {}
  try { if (typeof process.send === 'function') process.send({ type: 'error', message: 'Worker crash: ' + ((err && err.message) || String(err)) }) } catch (_) {}
}
process.on('uncaughtException', (err) => {
  try {
    if (isDmlTdrError(err)) {
      try { process.send({ type: 'fallback', provider: 'cpu', message: CPU_FALLBACK_LOG }) } catch (_) {}
      try { process.send({ type: 'log', message: CPU_FALLBACK_LOG }) } catch (_) {}
    }
  } catch (_) {}
  reportFatal(err)
  process.exit(1)
})
process.on('unhandledRejection', (err) => {
  try {
    if (isDmlTdrError(err)) {
      try { process.send({ type: 'fallback', provider: 'cpu', message: CPU_FALLBACK_LOG }) } catch (_) {}
      try { process.send({ type: 'log', message: CPU_FALLBACK_LOG }) } catch (_) {}
    }
  } catch (_) {}
  reportFatal(err)
  process.exit(1)
})

const sharp = require('sharp')
const {
  applySigmoidIfNeeded,
  parseTagLabels,
  resolveInputLayout,
  selectOutputNames,
} = require('./tagger-layout')

function readIoShape(metadata, preferredName) {
  if (!metadata) return []
  const entries = Array.isArray(metadata)
    ? metadata
    : Object.entries(metadata).map(([name, meta]) => ({ name, ...(meta || {}) }))
  const entry = entries.find((item) => item && item.name === preferredName) || entries[0] || {}
  return entry.shape || entry.dims || entry.dimensions || []
}

// ── State ──
let session = null
let sessionModelPath = ''
let forceCpu = false
let labels = []
let resizeDim = 448
let cancelled = false
let ort = null
let activeProvider = 'cpu'
let inputLayout = 'nchw'
let outputOrder = []
let normalization = 'none'
let padColor = [255, 255, 255]
let resizeMode = 'letterbox'
let inferOptions = {
  generalThreshold: 0.35,
  characterThreshold: 0.85,
  addCharacter: true,
  addCopyright: true,
  replaceUnderscores: false,
}

// ── CSV label loading ──
function loadCsv(csvPath) {
  try {
    return parseTagLabels(fs.readFileSync(csvPath, 'utf-8'))
  } catch (e) {
    process.send({ type: 'error', message: 'Failed to load CSV: ' + e.message })
    return []
  }
}

// ── Image preprocessing ──
function normalizeChannels(r, g, b, mode) {
  if (mode === 'wd14_bgr') return [b / 255, g / 255, r / 255]
  if (mode === 'imagenet') {
    return [(r / 255 - 0.485) / 0.229, (g / 255 - 0.456) / 0.224, (b / 255 - 0.406) / 0.225]
  }
  if (mode === 'minus_one_to_one') return [r / 255 * 2 - 1, g / 255 * 2 - 1, b / 255 * 2 - 1]
  return [r / 255, g / 255, b / 255]
}

async function preprocessOne(imagePath, dim, layout = 'nchw') {
  const bg = {
    r: Number.isFinite(padColor[0]) ? padColor[0] : 255,
    g: Number.isFinite(padColor[1]) ? padColor[1] : 255,
    b: Number.isFinite(padColor[2]) ? padColor[2] : 255,
  }
  const fit = resizeMode === 'stretch' ? 'fill' : 'inside'
  // Must request raw pixels. Encoded PNG/JPEG buffers cannot be reopened as { raw }.
  const { data: raw, info } = await sharp(imagePath)
    .resize(dim, dim, { fit, background: bg })
    .ensureAlpha()
    .flatten({ background: bg })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const channels = info.channels || 3
  if (channels < 3) {
    throw new Error('preprocess expected at least 3 channels, got ' + channels)
  }

  // Center-pad to dim×dim RGB
  const padded = Buffer.alloc(dim * dim * 3)
  for (let i = 0; i < padded.length; i += 3) {
    padded[i] = bg.r
    padded[i + 1] = bg.g
    padded[i + 2] = bg.b
  }
  const ox = Math.floor((dim - info.width) / 2)
  const oy = Math.floor((dim - info.height) / 2)
  for (let y = 0; y < info.height; y++) {
    const srcRow = y * info.width * channels
    const dstRow = ((oy + y) * dim + ox) * 3
    for (let x = 0; x < info.width; x++) {
      const src = srcRow + x * channels
      const dst = dstRow + x * 3
      padded[dst] = raw[src]
      padded[dst + 1] = raw[src + 1]
      padded[dst + 2] = raw[src + 2]
    }
  }

  const floatArr = new Float32Array(3 * dim * dim)
  if (layout === 'nhwc') {
    for (let p = 0; p < dim * dim; p++) {
      const [nr, ng, nb] = normalizeChannels(padded[p * 3], padded[p * 3 + 1], padded[p * 3 + 2], normalization)
      floatArr[p * 3] = nr
      floatArr[p * 3 + 1] = ng
      floatArr[p * 3 + 2] = nb
    }
  } else {
    for (let p = 0; p < dim * dim; p++) {
      const [nr, ng, nb] = normalizeChannels(padded[p * 3], padded[p * 3 + 1], padded[p * 3 + 2], normalization)
      floatArr[p] = nr
      floatArr[dim * dim + p] = ng
      floatArr[2 * dim * dim + p] = nb
    }
  }
  return floatArr
}

async function stackPreprocess(imagePaths, dim, layout = 'nchw') {
  const tensors = await Promise.all(imagePaths.map((p) => preprocessOne(p, dim, layout)))
  const perImage = layout === 'nhwc' ? dim * dim * 3 : 3 * dim * dim
  const flat = new Float32Array(tensors.length * perImage)
  for (let i = 0; i < tensors.length; i++) {
    flat.set(tensors[i], i * perImage)
  }
  return flat
}

// ── ONNX session management ──
async function disposeSession() {
  const current = session
  session = null
  if (current && typeof current.release === 'function') {
    try { await current.release() } catch (_) {}
  }
}

async function fallbackToCpu(reason) {
  forceCpu = true
  activeProvider = 'cpu'
  await disposeSession()
  if (!sessionModelPath) throw new Error('Cannot recreate ONNX session on CPU: missing model path')
  session = await createSession(sessionModelPath, ['cpu'])
  try { process.send({ type: 'fallback', provider: 'cpu', message: CPU_FALLBACK_LOG, reason: String(reason || '') }) } catch (_) {}
  try { process.send({ type: 'log', message: CPU_FALLBACK_LOG }) } catch (_) {}
}

async function createSession(modelPath, providers) {
  if (modelPath) sessionModelPath = modelPath
  const requested = (forceCpu
    ? ['cpu']
    : (providers && providers.length ? providers : ['cpu'])
  ).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
  const unique = [...new Set([...requested, 'cpu'])]
  let lastError = null
  for (const provider of unique) {
    if (forceCpu && provider !== 'cpu') continue
    try {
      const sess = await ort.InferenceSession.create(sessionModelPath || modelPath, {
        executionProviders: [provider],
        graphOptimizationLevel: 'all',
        enableMemPattern: true,
      })
      activeProvider = provider
      process.send({ type: 'log', message: 'ONNX session created on ' + provider })
      return sess
    } catch (error) {
      lastError = error
      process.send({ type: 'log', message: 'ONNX provider ' + provider + ' failed: ' + (error.message || error) })
      if (isDmlTdrError(error) && provider !== 'cpu') {
        forceCpu = true
        try { process.send({ type: 'log', message: CPU_FALLBACK_LOG }) } catch (_) {}
      }
    }
  }
  throw lastError || new Error('Failed to create ONNX session')
}

// ── Batch inference with adaptive sizing ──
async function runInference(imagePaths, threshold, maxBatch) {
  const results = []
  const gpu = activeProvider !== 'cpu' && !forceCpu
  let batch = gpu ? 1 : Math.max(1, maxBatch || 4)
  cancelled = false

  for (let i = 0; i < imagePaths.length; ) {
    if (cancelled) {
      process.send({ type: 'cancelled', results })
      return
    }

    const end = Math.min(i + batch, imagePaths.length)
    const slice = imagePaths.slice(i, end)

    try {
      const flat = await stackPreprocess(slice, resizeDim, inputLayout)
      const shape = inputLayout === 'nhwc'
        ? [slice.length, resizeDim, resizeDim, 3]
        : [slice.length, 3, resizeDim, resizeDim]
      const tensor = new ort.Tensor('float32', flat, shape)
      const feeds = { [session.inputNames[0]]: tensor }
      if (slice.length === 1 || i === 0) {
        process.send({ type: 'log', message: 'session.run shape=' + JSON.stringify(shape) + ' provider=' + activeProvider + ' batch=' + batch })
      }
      const output = await session.run(feeds)
      let probs = null
      for (const name of outputOrder) {
        if (output[name] && output[name].data) {
          probs = output[name].data
          break
        }
      }
      if (!probs && session.outputNames[0]) probs = output[session.outputNames[0]]?.data
      if (!probs) throw new Error('Tagger model returned no output')
      const probabilities = applySigmoidIfNeeded(probs)

      const tagsPerImage = labels.length
      for (let j = 0; j < slice.length; j++) {
        const start = j * tagsPerImage
        const imgTags = []
        for (let k = 0; k < tagsPerImage; k++) {
          const category = labels[k].category
          const isCharacter = category === 4 || category === 'character'
          const isCopyright = category === 3 || category === 'copyright'
          if (isCharacter && inferOptions.addCharacter === false) continue
          if (isCopyright && inferOptions.addCopyright === false) continue
          const cut = isCharacter ? (inferOptions.characterThreshold ?? threshold) : (inferOptions.generalThreshold ?? threshold)
          if (probabilities[start + k] >= cut) {
            const name = inferOptions.replaceUnderscores ? String(labels[k].name).replace(/_/g, ' ') : labels[k].name
            imgTags.push({
              tag: name,
              category: labels[k].category,
              confidence: Math.round(probabilities[start + k] * 10000) / 10000,
            })
          }
        }
        imgTags.sort((a, b) => b.confidence - a.confidence)
        results.push({ path: slice[j], tags: imgTags })
      }

      i = end

      // DirectML is not safe to grow: a 1->32 ramp on a contended NVIDIA adapter TDRs.
      if (batch * 2 <= 32 && (activeProvider === 'cpu' || forceCpu)) {
        batch = Math.min(batch * 2, 32)
      }

    } catch (e) {
      const msg = (e && e.message) || String(e || '')
      if (isDmlTdrError(e) && !forceCpu && sessionModelPath) {
        batch = 1
        try {
          await fallbackToCpu(msg)
          continue
        } catch (fallbackErr) {
          process.send({ type: 'log', message: 'CPU fallback failed: ' + ((fallbackErr && fallbackErr.message) || fallbackErr) })
          for (const imagePath of slice) results.push({ path: imagePath, tags: [], error: msg })
          i = end
        }
      } else if ((msg.includes('OOM') || msg.includes('memory') || msg.includes('CUDA_ERROR')) && batch > 1) {
        batch = Math.max(1, Math.floor(batch / 2))
        process.send({ type: 'log', message: 'OOM: reducing batch to ' + batch })
        if (activeProvider !== 'cpu' && sessionModelPath) {
          try { await fallbackToCpu(msg) } catch (_) {}
        }
        continue
      } else {
        results.push({ path: slice[0], tags: [], error: msg })
        batch = 1
        i++
      }
    }

    process.send({
      type: 'progress',
      completed: i,
      total: imagePaths.length,
      currentFile: path.basename(slice[slice.length - 1] || ''),
      batchSize: batch,
      provider: activeProvider,
      results,
    })
  }

  process.send({ type: 'complete', results })
}

// ── Message handler ──
let messageChain = Promise.resolve()
process.on('message', (msg) => {
  messageChain = messageChain.then(() => handleWorkerMessage(msg)).catch((error) => {
    try { process.send({ type: 'error', message: (error && error.message) || String(error) }) } catch (_) {}
  })
})

async function handleWorkerMessage(msg) {
  if (msg.cmd === 'init') {
    try {
      ort = require('onnxruntime-node')
      resizeDim = msg.resolution || 448
      labels = loadCsv(msg.csvPath)
      normalization = msg.normalization || 'wd14_bgr'
      padColor = Array.isArray(msg.padColor) && msg.padColor.length >= 3 ? msg.padColor : [255, 255, 255]
      resizeMode = msg.resizeMode || 'letterbox'
      inferOptions = {
        generalThreshold: msg.generalThreshold ?? 0.35,
        characterThreshold: msg.characterThreshold ?? 0.85,
        addCharacter: msg.addCharacter !== false,
        addCopyright: msg.addCopyright !== false,
        replaceUnderscores: Boolean(msg.replaceUnderscores),
      }
      sessionModelPath = msg.modelPath
      forceCpu = forceCpu || !(msg.providers || []).some((item) => String(item || '').toLowerCase() === 'dml' || String(item || '').toLowerCase() === 'cuda')
      session = await createSession(msg.modelPath, msg.providers || ['cpu'])
      const inputDims = readIoShape(session.inputMetadata, session.inputNames[0])
      try {
        inputLayout = resolveInputLayout(inputDims)
      } catch (_) {
        inputLayout = msg.inputLayout === 'nhwc' || msg.inputLayout === 'nchw' ? msg.inputLayout : 'nhwc'
      }
      const outputDims = {}
      const outputMeta = session.outputMetadata || {}
      const outputEntries = Array.isArray(outputMeta) ? outputMeta : Object.entries(outputMeta).map(([name, meta]) => ({ name, ...(meta || {}) }))
      for (const entry of outputEntries) {
        const name = entry.name || session.outputNames[0]
        outputDims[name] = entry.shape || entry.dims || entry.dimensions || []
      }
      outputOrder = selectOutputNames(outputDims, labels.length)
      if (!outputOrder.length) outputOrder = session.outputNames || []
      process.send({
        type: 'ready',
        labelCount: labels.length,
        provider: activeProvider,
        inputLayout,
      })
    } catch (e) {
      process.send({ type: 'error', message: 'Init failed: ' + e.message })
    }
  }

  if (msg.cmd === 'infer') {
    try {
      if (!session) {
        process.send({ type: 'error', message: 'Not initialized. Send init first.' })
        return
      }
      inferOptions = {
        generalThreshold: msg.generalThreshold ?? inferOptions.generalThreshold ?? msg.threshold ?? 0.35,
        characterThreshold: msg.characterThreshold ?? inferOptions.characterThreshold ?? 0.85,
        addCharacter: msg.addCharacter === undefined ? inferOptions.addCharacter : Boolean(msg.addCharacter),
        addCopyright: msg.addCopyright === undefined ? inferOptions.addCopyright : Boolean(msg.addCopyright),
        replaceUnderscores: msg.replaceUnderscores === undefined ? inferOptions.replaceUnderscores : Boolean(msg.replaceUnderscores),
      }
      const requestedBatch = forceCpu || activeProvider === 'cpu' ? (msg.batchSize || 4) : 1
      process.send({ type: 'log', message: 'infer start provider=' + activeProvider + ' batch=' + requestedBatch + ' images=' + (msg.imagePaths || []).length + ' layout=' + inputLayout + ' dim=' + resizeDim })
      await runInference(msg.imagePaths, inferOptions.generalThreshold || 0.35, requestedBatch)
    } catch (error) {
      if (isDmlTdrError(error) && sessionModelPath && !forceCpu) {
        try {
          await fallbackToCpu(error && error.message)
          await runInference(msg.imagePaths, inferOptions.generalThreshold || 0.35, 1)
          return
        } catch (_) {}
      }
      try { process.send({ type: 'error', message: (error && error.message) || String(error) }) } catch (_) {}
    }
  }

  if (msg.cmd === 'cancel') {
    cancelled = true
  }

  if (msg.cmd === 'shutdown') {
    session = null
    labels = []
    process.exit(0)
  }
}

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
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const {
  applySigmoidIfNeeded,
  parseTagLabels,
  resolveInputLayout,
  selectOutputNames,
} = require('./tagger-layout')

// ── State ──
let session = null
let labels = []
let resizeDim = 448
let cancelled = false
let ort = null
let activeProvider = 'cpu'
let inputLayout = 'nchw'
let outputOrder = []

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
async function preprocessOne(imagePath, dim, layout = 'nchw') {
  const { data, info } = await sharp(imagePath)
    .resize(dim, dim, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const raw = data

  // Center-pad to dim×dim
  const padded = Buffer.alloc(dim * dim * 3, 255) // white
  const ox = Math.floor((dim - info.width) / 2)
  const oy = Math.floor((dim - info.height) / 2)
  for (let y = 0; y < info.height; y++) {
    const srcOff = y * info.width * 3
    const dstOff = ((oy + y) * dim + ox) * 3
    for (let x = 0; x < info.width * 3; x++) {
      padded[dstOff + x] = raw[srcOff + x]
    }
  }

  // Convert to float32 [0,1]
  const floatArr = new Float32Array(3 * dim * dim)
  if (layout === 'nhwc') {
    for (let p = 0; p < dim * dim; p++) {
      floatArr[p * 3] = padded[p * 3] / 255.0
      floatArr[p * 3 + 1] = padded[p * 3 + 1] / 255.0
      floatArr[p * 3 + 2] = padded[p * 3 + 2] / 255.0
    }
  } else {
    for (let c = 0; c < 3; c++) {
      for (let p = 0; p < dim * dim; p++) {
        floatArr[c * dim * dim + p] = padded[p * 3 + c] / 255.0
      }
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
async function createSession(modelPath, providers) {
  const sessionOpts = {
    executionProviders: providers || ['cpu'],
    graphOptimizationLevel: 'all',
    enableMemPattern: true,
  }
  const sess = await ort.InferenceSession.create(modelPath, sessionOpts)
  activeProvider = sess.handler?.provider || providers[0] || 'cpu'
  process.send({ type: 'log', message: `ONNX session created on ${activeProvider}` })
  return sess
}

// ── Batch inference with adaptive sizing ──
async function runInference(imagePaths, threshold, maxBatch) {
  const results = []
  let batch = maxBatch || 4
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
          if (probabilities[start + k] >= threshold) {
            imgTags.push({
              tag: labels[k].name,
              category: labels[k].category,
              confidence: Math.round(probabilities[start + k] * 10000) / 10000,
            })
          }
        }
        imgTags.sort((a, b) => b.confidence - a.confidence)
        results.push({ path: slice[j], tags: imgTags })
      }

      i = end

      // Adaptive batch: grow on success
      if (batch * 2 <= 32 && activeProvider !== 'cpu') {
        batch = Math.min(batch * 2, 32)
      }

    } catch (e) {
      const msg = e.message || ''
      if ((msg.includes('OOM') || msg.includes('memory') || msg.includes('CUDA_ERROR')) && batch > 1) {
        // Halve batch and retry
        batch = Math.max(1, Math.floor(batch / 2))
        process.send({ type: 'log', message: `OOM: reducing batch to ${batch}` })
        if (activeProvider !== 'cpu') {
          try { activeProvider = 'cpu'; session = await createSession(session.handler?.modelPath, ['cpu']) } catch (_) {}
          process.send({ type: 'log', message: 'Falling back to CPU' })
        }
        continue // retry this slice
      } else {
        // Per-image error, continue
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
    })
  }

  process.send({ type: 'complete', results })
}

// ── Message handler ──
process.on('message', async (msg) => {
  if (msg.cmd === 'init') {
    try {
      ort = require('onnxruntime-node')
      resizeDim = msg.resolution || 448
      labels = loadCsv(msg.csvPath)
      session = await createSession(msg.modelPath, msg.providers || ['cpu'])
      const inputDims = session.inputMetadata[session.inputNames[0]]?.dims || [1, 3, resizeDim, resizeDim]
      try {
        inputLayout = resolveInputLayout(inputDims)
      } catch (_) {
        inputLayout = 'nchw'
      }
      const outputDims = {}
      for (const [name, meta] of Object.entries(session.outputMetadata || {})) {
        outputDims[name] = meta?.dims || meta?.dimensions || []
      }
      outputOrder = selectOutputNames(outputDims, labels.length)
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
    if (!session) {
      process.send({ type: 'error', message: 'Not initialized. Send init first.' })
      return
    }
    await runInference(msg.imagePaths, msg.threshold || 0.35, msg.batchSize || 4)
  }

  if (msg.cmd === 'cancel') {
    cancelled = true
  }

  if (msg.cmd === 'shutdown') {
    session = null
    labels = []
    process.exit(0)
  }
})

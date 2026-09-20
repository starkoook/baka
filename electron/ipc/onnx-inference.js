/**
 * Single ONNX worker launcher used by inferBatch and generateTaggingResults.
 */
const path = require('path')
const fs = require('fs')
const { fork } = require('child_process')
const { resolveInferOptions, filterPredictedTags, resolveTaggingProviders, isDmlTdrError, CPU_FALLBACK_LOG } = require('./tagger-settings')

function getTaggerWorkerPath() {
  const inside = path.join(__dirname, 'tagger-worker.js')
  if (inside.includes('app.asar' + path.sep) || inside.includes('app.asar/')) {
    const unpacked = inside.replace('app.asar', 'app.asar.unpacked')
    try { if (fs.existsSync(unpacked)) return unpacked } catch (_) {}
  }
  return inside
}

function getAsarNodeModules() {
  const here = __dirname
  const marker = path.sep + 'app.asar' + path.sep
  const idx = here.indexOf(marker)
  if (idx >= 0) return path.join(here.slice(0, idx + ('app.asar').length + 1), 'node_modules')
  if (here.includes('app.asar.unpacked')) {
    const root = here.slice(0, here.indexOf('app.asar.unpacked') + ('app.asar').length)
    return path.join(root, 'node_modules')
  }
  return path.join(__dirname, '..', '..', 'node_modules')
}

function spawnTaggerWorker() {
  const workerPath = getTaggerWorkerPath()
  const nodePathParts = [getAsarNodeModules(), process.env.NODE_PATH].filter(Boolean)
  return fork(workerPath, [], {
    execPath: process.execPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_PATH: [...new Set(nodePathParts)].join(path.delimiter),
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })
}

function attachWorkerLogs(worker) {
  let stderrBuf = ''
  const write = (level, prefix, chunk) => {
    const text = String(chunk || '').replace(/\s+$/g, '')
    if (!text) return
    try { require('./app-log').writeAppLog(level, '[ONNX] ' + prefix + text, 'onnx') } catch (_) {}
  }
  if (worker.stderr) {
    worker.stderr.on('data', (chunk) => {
      stderrBuf += String(chunk)
      write('error', 'worker stderr: ', chunk)
    })
  }
  if (worker.stdout) {
    worker.stdout.on('data', (chunk) => {
      write('info', 'worker stdout: ', chunk)
    })
  }
  return () => stderrBuf
}

function mergeInferenceResults(base, extra) {
  const map = new Map()
  for (const item of base || []) {
    if (item && item.path) map.set(item.path, item)
  }
  for (const item of extra || []) {
    if (item && item.path) map.set(item.path, item)
  }
  return [...map.values()]
}

function writeOnnxLog(level, message, source) {
  try { require('./app-log').writeAppLog(level, message, source || 'onnx') } catch (_) {}
}


let onnxChain = Promise.resolve()
let onnxBusy = false
let liveWorker = null

function killLiveWorker() {
  const current = liveWorker
  liveWorker = null
  if (!current) return
  try { current.removeAllListeners() } catch (_) {}
  try { if (current.connected) current.send({ cmd: 'shutdown' }) } catch (_) {}
  try { current.kill() } catch (_) {}
}

function runOnnxInference(params = {}) {
  if (onnxBusy || liveWorker) {
    writeOnnxLog('warn', '[ONNX] serializing run — another DML/CPU session is still live')
  }
  const job = () => {
    onnxBusy = true
    return runOnnxInferenceUnlocked(params).finally(() => {
      onnxBusy = false
    })
  }
  const next = onnxChain.then(job, job)
  onnxChain = next.then(() => {}, () => {})
  return next
}

function runOnnxInferenceUnlocked(params = {}) {

  return new Promise((resolve, reject) => {
    const {
      modelPath,
      csvPath,
      imagePaths = [],
      resolution = 448,
      signal,
      onProgress,
      normalization,
      padColor,
      resizeMode,
    } = params

    if (!modelPath) {
      const err = new Error('Local tagging needs an ONNX model')
      writeOnnxLog('error', '[ONNX] ' + err.message)
      reject(err)
      return
    }
    if (!imagePaths.length) {
      resolve([])
      return
    }

    const options = resolveInferOptions(params)
    let providers = resolveTaggingProviders(params)
    const usingGpu = providers[0] && providers[0] !== 'cpu'
    const batchSize = usingGpu ? 1 : (params.batchSize || 4)
    let remaining = imagePaths.slice()
    let collected = []
    let usedCpuFallback = false
    let recovering = false
    let settled = false
    let worker = null
    let getStderr = () => ''

    const cleanupWorker = (w) => {
      if (!w) return
      if (liveWorker === w) liveWorker = null
      try { w.removeAllListeners() } catch (_) {}
      try { if (w.connected) w.send({ cmd: 'shutdown' }) } catch (_) {}
      try { w.kill() } catch (_) {}
    }

    const cleanup = () => {
      cleanupWorker(worker)
      worker = null
    }

    const fail = (message) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(message))
    }

    const finish = (results, cancelled = false) => {
      if (settled) return
      settled = true
      cleanup()
      const mapped = (results || []).map((item) => ({
        ...item,
        tags: filterPredictedTags(item.tags || [], options),
        cancelled: cancelled || item.cancelled,
      }))
      resolve(mapped)
    }

    const noteCpuFallback = () => {
      writeOnnxLog('warn', CPU_FALLBACK_LOG)
    }

    const remainingFromCollected = () => {
      const done = new Set(collected.map((item) => item.path))
      return imagePaths.filter((imagePath) => !done.has(imagePath))
    }

    const recoverOnCpu = (reason) => {
      if (settled || recovering) return
      if (usedCpuFallback && providers[0] === 'cpu') {
        fail(reason || 'ONNX CPU fallback failed')
        return
      }
      recovering = true
      usedCpuFallback = true
      providers = ['cpu']
      noteCpuFallback()
      remaining = remainingFromCollected()
      if (!remaining.length) {
        recovering = false
        finish(collected)
        return
      }
      const old = worker
      worker = null
      try { startWorker(['cpu']) } finally { recovering = false }
      cleanupWorker(old)
    }

    const startWorker = (nextProviders) => {
      worker = spawnTaggerWorker()
      liveWorker = worker
      getStderr = attachWorkerLogs(worker)

      const onMessage = (msg) => {
        try {
          if (!msg || settled) return
          if (msg.type === 'ready') {
            worker.send({
              cmd: 'infer',
              imagePaths: remaining,
              threshold: options.generalThreshold,
              generalThreshold: options.generalThreshold,
              characterThreshold: options.characterThreshold,
              addCharacter: options.addCharacter,
              addCopyright: options.addCopyright,
              replaceUnderscores: options.replaceUnderscores,
              batchSize: nextProviders[0] === 'cpu' ? (params.batchSize || 4) : 1,
            })
          } else if (msg.type === 'progress') {
            if (Array.isArray(msg.results)) collected = mergeInferenceResults(collected, msg.results)
            onProgress?.(msg)
          } else if (msg.type === 'fallback') {
            usedCpuFallback = true
            providers = ['cpu']
            noteCpuFallback()
          } else if (msg.type === 'log') {
            const line = String(msg.message || '')
            if (line === CPU_FALLBACK_LOG || isDmlTdrError(line)) {
              usedCpuFallback = true
              providers = ['cpu']
              noteCpuFallback()
            } else {
              writeOnnxLog('info', '[ONNX] ' + line)
            }
          } else if (msg.type === 'complete') {
            collected = mergeInferenceResults(collected, Array.isArray(msg.results) ? msg.results : [])
            finish(collected)
          } else if (msg.type === 'cancelled') {
            collected = mergeInferenceResults(collected, Array.isArray(msg.results) ? msg.results : [])
            finish(collected, true)
          } else if (msg.type === 'error') {
            const message = msg.message || 'Local tagging failed'
            writeOnnxLog('error', '[ONNX] ' + message)
            if (!usedCpuFallback && (isDmlTdrError(message) || isDmlTdrError(getStderr()))) {
              recoverOnCpu(message)
              return
            }
            fail(message)
          }
        } catch (error) {
          writeOnnxLog('error', '[ONNX] handler: ' + ((error && error.message) || error))
          if (!usedCpuFallback && isDmlTdrError(error)) {
            recoverOnCpu(error && error.message)
          }
        }
      }

      worker.on('message', onMessage)
      worker.on('error', (error) => {
        try {
          if (settled) return
          writeOnnxLog('error', '[ONNX] worker error: ' + (error && error.message))
          if (!usedCpuFallback && (isDmlTdrError(error) || isDmlTdrError(getStderr()) || usingGpu)) {
            recoverOnCpu(error && error.message)
            return
          }
          fail(error.message)
        } catch (_) {}
      })
      worker.on('exit', (code) => {
        try {
          if (settled) return
          const stderr = String(getStderr() || '').trim()
          const tail = stderr ? (': ' + stderr.split(/\r?\n/).filter(Boolean).slice(-8).join(' | ')) : ''
          const message = 'ONNX tagger exited (code ' + code + ')' + tail
          const tdr = isDmlTdrError(stderr) || isDmlTdrError(message) || (usingGpu && !usedCpuFallback)
          if (tdr && remainingFromCollected().length) {
            recoverOnCpu(message)
            return
          }
          if (!usedCpuFallback && remainingFromCollected().length && usingGpu) {
            recoverOnCpu(message)
            return
          }
          writeOnnxLog('error', '[ONNX] ' + message)
          fail(message)
        } catch (_) {
          fail('ONNX tagger exited (code ' + code + ')')
        }
      })

      try {
        worker.send({
          cmd: 'init',
          modelPath,
          csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
          resolution,
          providers: (nextProviders && nextProviders.length) ? nextProviders : ['cpu'],
          normalization,
          padColor,
          resizeMode,
          inputLayout: params.inputLayout,
          generalThreshold: options.generalThreshold,
          characterThreshold: options.characterThreshold,
          addCharacter: options.addCharacter,
          addCopyright: options.addCopyright,
          replaceUnderscores: options.replaceUnderscores,
        })
      } catch (error) {
        fail('Failed to start ONNX worker: ' + (error && error.message ? error.message : error))
      }
    }

    if (signal) {
      if (signal.aborted) {
        finish([], true)
        return
      }
      signal.addEventListener('abort', () => {
        try { if (worker) worker.send({ cmd: 'cancel' }) } catch (_) {}
      }, { once: true })
    }

    startWorker(providers)
  })
}


module.exports = {
  getTaggerWorkerPath,
  getAsarNodeModules,
  spawnTaggerWorker,
  runOnnxInference,
  killLiveWorker,
}
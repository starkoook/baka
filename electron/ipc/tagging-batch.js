const fs = require('fs')
const path = require('path')
const { fork } = require('child_process')
const { ensureDb, queryAll, runSql } = require('./gallery')
const { writeTextSafe } = require('./safe-file')
const { isVideoFile, extractVideoFrames } = require('./video-frames')
const { generateWithLlm } = require('./tagging-pipeline')
const { getDataRoot } = require('./paths')
const { mergeTagLists } = require('./tag-merge')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])

function getTaggerWorkerPath() {
  return path.join(__dirname, 'tagger-worker.js')
}

function getTemplatesPath() {
  return path.join(getDataRoot(), 'tagger-templates.json')
}

function loadTemplates() {
  try {
    if (fs.existsSync(getTemplatesPath())) {
      const raw = fs.readFileSync(getTemplatesPath(), 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (_) {}
  return []
}

function saveTemplates(templates) {
  fs.mkdirSync(path.dirname(getTemplatesPath()), { recursive: true })
  fs.writeFileSync(getTemplatesPath(), JSON.stringify(templates, null, 2), 'utf-8')
}

function upsertTemplate(template) {
  if (!template || !template.id || !String(template.prompt || '').trim()) {
    throw new Error('模板必须包含 id 和 prompt')
  }
  const templates = loadTemplates()
  const idx = templates.findIndex((item) => item.id === template.id)
  const next = {
    id: String(template.id).trim(),
    name: String(template.name || template.id).trim(),
    prompt: String(template.prompt).trim(),
    updatedAt: Date.now(),
  }
  if (idx >= 0) templates[idx] = next
  else templates.push(next)
  saveTemplates(templates)
  return next
}

function deleteTemplate(id) {
  const templates = loadTemplates().filter((item) => item.id !== id)
  saveTemplates(templates)
  return templates
}

function importTemplates(entries) {
  const templates = loadTemplates()
  let count = 0
  for (const entry of entries || []) {
    const id = String(entry?.id || '').trim()
    const prompt = String(entry?.prompt || '').trim()
    if (!id || !prompt) continue
    const idx = templates.findIndex((item) => item.id === id)
    const next = { id, name: String(entry.name || id).trim(), prompt, updatedAt: Date.now() }
    if (idx >= 0) templates[idx] = next
    else templates.push(next)
    count++
  }
  saveTemplates(templates)
  return { count, templates }
}

function applyPostprocessOptions(tags, options = {}) {
  const seen = new Set()
  const result = []
  for (const raw of tags || []) {
    let value = String(raw).trim().replace(/^[\s\-*.)]+/, '').replace(/["'`]/g, '').trim()
    if (!value || value.length > 100) continue
    if (/^(<think>|<\/think>|```)/i.test(value)) continue
    value = value.replace(/<[^>]+>/g, '')
    if (options.replaceUnderscores) value = value.replace(/_/g, ' ')
    if (options.prefix) value = `${options.prefix} ${value}`
    if (options.suffix) value = `${value} ${options.suffix}`
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  if (options.sort === 'alphabetical') result.sort((a, b) => a.localeCompare(b))
  return result
}

async function getImagePaths(imageIds) {
  if (!imageIds || imageIds.length === 0) return []
  const placeholders = imageIds.map(() => '?').join(',')
  const rows = queryAll(`SELECT path FROM images WHERE id IN (${placeholders})`, imageIds)
  return rows.map((row) => row.path)
}

async function getImageTagNames(imageId) {
  const rows = queryAll(
    `SELECT t.name as tag
     FROM image_tags it
     JOIN tags t ON t.id = it.tag_id
     WHERE it.image_id = ?
     ORDER BY it.confidence DESC`,
    [imageId]
  )
  return rows.map((row) => row.tag)
}

async function readImageSource(imagePath) {
  let sourcePath = imagePath
  if (isVideoFile(imagePath)) {
    const frames = await extractVideoFrames(imagePath, 3)
    sourcePath = frames[0] || imagePath
  }
  const imageBase64 = fs.readFileSync(sourcePath).toString('base64')
  const ext = path.extname(sourcePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
  return { sourcePath, imageBase64, mimeType }
}

function runLocalInference({ modelPath, csvPath, imagePaths, threshold = 0.35, batchSize = 4, resolution = 448, providers = ['cpu'], signal, onProgress }) {
  return new Promise((resolve, reject) => {
    if (!modelPath) {
      reject(new Error('本地标注需要选择 ONNX 模型'))
      return
    }
    if (!csvPath && !modelPath.toLowerCase().endsWith('.onnx')) {
      reject(new Error('本地标注需要与模型同名的 CSV 标签文件'))
      return
    }

    const worker = fork(getTaggerWorkerPath(), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
    let settled = false
    let currentWorker = worker

    const cleanup = () => {
      if (currentWorker && currentWorker.connected) {
        try { currentWorker.send({ cmd: 'shutdown' }) } catch (_) {}
      }
    }

    const fail = (message) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(message))
    }

    const onMessage = (msg) => {
      if (msg.type === 'ready') {
        worker.send({ cmd: 'infer', imagePaths, threshold, batchSize })
      } else if (msg.type === 'progress') {
        onProgress?.(msg)
      } else if (msg.type === 'complete') {
        if (settled) return
        settled = true
        cleanup()
        resolve(Array.isArray(msg.results) ? msg.results : [])
      } else if (msg.type === 'cancelled') {
        if (settled) return
        settled = true
        cleanup()
        resolve(Array.isArray(msg.results) ? msg.results : [])
      } else if (msg.type === 'error') {
        fail(msg.message || 'Local tagging failed')
      }
    }

    worker.on('message', onMessage)
    worker.on('error', (error) => fail(error.message))
    worker.on('exit', (code) => {
      if (!settled) fail(`ONNX 标注进程退出（code ${code}）`)
    })

    if (signal) {
      if (signal.aborted) {
        worker.send({ cmd: 'cancel' })
      } else {
        signal.addEventListener('abort', () => {
          try { worker.send({ cmd: 'cancel' }) } catch (_) {}
        }, { once: true })
      }
    }

    worker.send({
      cmd: 'init',
      modelPath,
      csvPath: csvPath || modelPath.replace(/\.onnx$/i, '.csv'),
      resolution,
      providers,
    })
  })
}

function localResultToTagStrings(localResults, imagePath) {
  const found = (localResults || []).find((item) => item.path === imagePath)
  return (found?.tags || []).map((item) => (typeof item === 'string' ? item : item.tag)).filter(Boolean)
}

function classifyLlmError(error) {
  const message = String(error?.message || error || '')
  const lower = message.toLowerCase()
  if (error?.name === 'AbortError' || lower.includes('abort') || lower.includes('cancel')) return 'cancelled'
  if (/401|403/.test(lower) || lower.includes('api key')) return 'auth'
  if (/429/.test(lower) || lower.includes('rate limit')) return 'rate_limit'
  if (/5\d\d/.test(lower) || lower.includes('timeout')) return 'server'
  return 'unknown'
}

async function generateWithRetry(fn, retries = 2, signal) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' })
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const kind = classifyLlmError(error)
      if (kind === 'cancelled') throw error
      if (kind === 'auth' || attempt >= retries) throw error
      await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)))
    }
  }
  throw lastError
}

function resolveTaggingConfigs(params) {
  if (!params?.apiConfigIds?.length) return [{}]
  const configsPath = path.join(getDataRoot(), 'workbench-api-configs.json')
  try {
    const list = JSON.parse(fs.readFileSync(configsPath, 'utf-8'))
    const wanted = new Set(params.apiConfigIds)
    const selected = list.filter((item) => wanted.has(item.id))
    return selected.length ? selected : [{}]
  } catch (_) {
    return [{}]
  }
}

function listTaggingConfigs() {
  const configsPath = path.join(getDataRoot(), 'workbench-api-configs.json')
  try {
    if (fs.existsSync(configsPath)) {
      const list = JSON.parse(fs.readFileSync(configsPath, 'utf-8'))
      return Array.isArray(list) ? list : []
    }
  } catch (_) {}
  return []
}

async function mapLimit(items, limit, worker, options = {}) {
  const intervalMs = Number(options.intervalMs) || 0
  const results = new Array(items.length)
  let nextIndex = 0
  let nextStartAt = Date.now()
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      if (intervalMs > 0) {
        const startAt = nextStartAt
        nextStartAt = startAt + intervalMs
        const wait = startAt - Date.now()
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      }
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

async function generateTaggingResults(params, onProgress) {
  await ensureDb()
  const imagePaths = params.imagePaths || await getImagePaths(params.imageIds || [])
  if (!imagePaths.length) return []

  const source = params.source || 'llm'
  const outputFormat = params.outputFormat || (source === 'natural' ? 'natural' : 'danbooru')
  const configs = resolveTaggingConfigs(params)
  const concurrency = Math.max(1, Math.min(8, Number(params.concurrency) || 1))
  const retries = Math.max(0, Math.min(4, Number(params.retries ?? 2)))
  const targetRpm = Math.max(0, Number(params.targetRpm) || 0)
  const intervalMs = targetRpm > 0 ? 60000 / targetRpm : 0

  let localResults = []
  if (source === 'local' || source === 'combined') {
    localResults = await runLocalInference({
      modelPath: params.modelPath,
      csvPath: params.csvPath,
      imagePaths,
      threshold: params.threshold ?? 0.35,
      batchSize: params.batchSize || 4,
      resolution: params.resolution || 448,
      providers: params.providers || ['cpu'],
      signal: params.signal,
      onProgress,
    })
  }

  if (source === 'local') {
    return imagePaths.map((imagePath) => ({
      imagePath,
      tags: applyPostprocessOptions(localResultToTagStrings(localResults, imagePath), params),
      natural: '',
    }))
  }

  const results = await mapLimit(imagePaths, concurrency, async (imagePath, index) => {
    try {
      const localTags = source === 'combined'
        ? localResultToTagStrings(localResults, imagePath)
        : []
      const { sourcePath, imageBase64, mimeType } = await readImageSource(imagePath)
      const result = await generateWithRetry(async () => generateWithLlm({
        imageBase64,
        mimeType,
        templateId: params.templateId || 'danbooru-tags',
        outputFormat,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        localTags,
        signal: params.signal,
        config: configs[index % configs.length],
      }), retries, params.signal)
      const mergeStrategy = params.mergeStrategy
      const mergedTags = source === 'combined' && mergeStrategy && mergeStrategy !== 'b_only'
        ? mergeTagLists(localTags, result.tags || [], mergeStrategy)
        : result.tags || []
      result.tags = applyPostprocessOptions(mergedTags, params)
      if (onProgress) {
        onProgress({
          type: 'progress',
          completed: index + 1,
          total: imagePaths.length,
          currentFile: imagePath,
        })
      }
      return { imagePath, tags: result.tags || [], natural: result.natural || '' }
    } catch (error) {
      if (onProgress) {
        onProgress({
          type: 'progress',
          completed: index + 1,
          total: imagePaths.length,
          currentFile: imagePath,
        })
      }
      return { imagePath, tags: [], natural: '', error: error.message || String(error) }
    }
  }, { intervalMs })

  return results
}

function applyWriteMode(existingTags, newTags, mode = 'replace') {
  const existing = [...new Set((existingTags || []).map((tag) => String(tag).trim()).filter(Boolean))]
  const incoming = [...new Set((newTags || []).map((tag) => String(tag).trim()).filter(Boolean))]
  if (mode === 'skip_existing' && existing.length) return existing
  if (mode === 'empty_only' && existing.length) return existing
  if (mode === 'append') return [...new Set([...existing, ...incoming])]
  return incoming
}

function findImageIdByPath(imagePath) {
  const rows = queryAll('SELECT id FROM images WHERE path = ?', [imagePath])
  return rows[0]?.id ?? null
}

async function writeImageTagsAndCaption(imageId, imagePath, tags, captionOverride = '') {
  const imageRows = queryAll('SELECT path FROM images WHERE id = ?', [imageId])
  const actualPath = imageRows[0]?.path || imagePath
  runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId])
  for (const tag of tags) {
    runSql('INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)', [tag, 'general'])
    const tagRow = queryAll('SELECT id FROM tags WHERE name = ?', [tag])[0]
    if (tagRow) {
      runSql('INSERT OR REPLACE INTO image_tags (image_id, tag_id, confidence, source) VALUES (?, ?, ?, ?)',
        [imageId, tagRow.id, null, 'manual'])
    }
  }

  const captionPath = actualPath.replace(/\.[^.]+$/, '') + '.txt'
  const caption = captionOverride || tags.join(', ')
  const result = await writeTextSafe(captionPath, caption)
  if (!result.success) throw new Error(result.error || 'Failed to write caption')
}

async function applyTaggingResults(params) {
  await ensureDb()
  const results = params.results || []
  const failures = []
  let updated = 0
  const writeMode = params.writeMode || 'replace'

  for (const result of results) {
    const imagePath = result.imagePath || result.path
    if (!imagePath) {
      failures.push({ path: '', error: 'Result is missing imagePath' })
      continue
    }
    try {
      let imageId = result.imageId ?? null
      if (!imageId) imageId = findImageIdByPath(imagePath)
      if (!imageId) {
        const captionPath = imagePath.replace(/\.[^.]+$/, '') + '.txt'
        const existing = fs.existsSync(captionPath) ? fs.readFileSync(captionPath, 'utf-8').split(',').map((t) => t.trim()).filter(Boolean) : []
        const finalTags = applyWriteMode(existing, result.tags || [], writeMode)
        const caption = result.natural && finalTags.length === 0 ? result.natural : finalTags.join(', ')
        const writeResult = await writeTextSafe(captionPath, caption)
        if (!writeResult.success) throw new Error(writeResult.error || 'Write failed')
      } else {
        const existing = await getImageTagNames(imageId)
        const finalTags = applyWriteMode(existing, result.tags || [], writeMode)
        const captionOverride = result.natural && finalTags.length === 0 ? result.natural : ''
        await writeImageTagsAndCaption(imageId, imagePath, finalTags, captionOverride)
      }
      updated++
    } catch (error) {
      failures.push({ path: imagePath, error: error.message })
    }
  }

  return { success: failures.length === 0, data: { updated, failures } }
}

module.exports = {
  IMAGE_EXTENSIONS,
  applyPostprocessOptions,
  applyTaggingResults,
  applyWriteMode,
  generateTaggingResults,
  getImagePaths,
  getImageTagNames,
  loadTemplates,
  saveTemplates,
  upsertTemplate,
  deleteTemplate,
  importTemplates,
  listTaggingConfigs,
  mapLimit,
  resolveTaggingConfigs,
  runLocalInference,
  localResultToTagStrings,
  writeImageTagsAndCaption,
}

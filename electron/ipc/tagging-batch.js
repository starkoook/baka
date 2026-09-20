const fs = require('fs')
const path = require('path')
const { ensureDb, queryAll, runSql } = require('./gallery')
const { writeTextSafe } = require('./safe-file')
const { isVideoFile, extractVideoFrames } = require('./video-frames')
const { generateWithLlm } = require('./tagging-pipeline')
const { getDataRoot } = require('./paths')
const { mergeTagLists } = require('./tag-merge')
const { serializeWeightedCaption, parseWeightedCaption } = require('./tag-weight')
const { runOnnxInference } = require('./onnx-inference')
const { resolveInferOptions, resolveTaggingProviders } = require('./tagger-settings')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'])

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

async function getImageTagEntries(imageId) {
  const rows = queryAll(
    `SELECT t.name as tag, t.category, it.confidence, it.source, it.weight
     FROM image_tags it
     JOIN tags t ON t.id = it.tag_id
     WHERE it.image_id = ?
     ORDER BY it.confidence DESC`,
    [imageId]
  )
  return rows.map((row) => ({
    tag: row.tag,
    category: row.category,
    confidence: row.confidence,
    source: row.source,
    weight: row.weight ?? 1,
  }))
}

async function getImageTagNames(imageId) {
  return (await getImageTagEntries(imageId)).map((row) => row.tag)
}

function normalizeTagEntries(tags) {
  const result = []
  for (const tag of tags || []) {
    if (typeof tag === 'string') {
      const parsed = parseWeightedCaption(tag)
      if (parsed.length) result.push(...parsed.map((item) => ({ ...item, source: 'manual' })))
      else if (tag.trim()) result.push({ tag: tag.trim(), weight: 1, source: 'manual' })
      continue
    }
    const name = String(tag.tag || tag.name || '').trim()
    if (!name) continue
    result.push({
      tag: name,
      weight: tag.weight ?? 1,
      confidence: tag.confidence ?? null,
      category: tag.category || 'general',
      source: tag.source || 'manual',
    })
  }
  return dedupeTagSet(result)
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

function runLocalInference(params) {
  const providers = resolveTaggingProviders(params)
  return runOnnxInference({ ...params, providers })
}

function localResultToTagStrings(localResults, imagePath) {
  const found = (localResults || []).find((item) => item.path === imagePath)
  return (found?.tags || []).map((item) => (typeof item === 'string' ? item : item.tag)).filter(Boolean)
}

function classifyLlmError(error) {
  const message = String(error?.message || error || '')
  const lower = message.toLowerCase()
  if (error?.name === 'AbortError' || lower.includes('abort') || lower.includes('cancel')) return 'cancelled'
  if (/401|403/.test(lower) || lower.includes('api key') || lower.includes('密钥') || lower.includes('先到设置')) return 'auth'
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

function loadWorkbenchApiConfigs() {
  try {
    const llm = require('./llm')
    if (typeof llm.loadApiConfigs === 'function') {
      const list = llm.loadApiConfigs()
      if (Array.isArray(list)) return list
    }
  } catch (_) {}
  return listTaggingConfigs()
}

function pickTaggingConfigs(list, apiConfigIds) {
  // apiKey filter: keyed workbench configs when apiConfigIds omitted
  const items = Array.isArray(list) ? list : []
  const withKey = items.filter((item) => String(item?.apiKey || '').trim())
  if (apiConfigIds?.length) {
    const wanted = new Set(apiConfigIds)
    const selected = items.filter((item) => wanted.has(item.id))
    if (selected.length) return selected
  }
  return withKey.length ? withKey : [{}]
}

function resolveTaggingConfigs(params) {
  const picked = pickTaggingConfigs(loadWorkbenchApiConfigs(), params?.apiConfigIds)
  const hasKey = picked.some((item) => String(item?.apiKey || '').trim())
  if (hasKey) return picked
  try {
    const llm = require('./llm')
    const cfg = typeof llm.loadConfig === 'function' ? llm.loadConfig() : null
    if (cfg && String(cfg.apiKey || '').trim()) {
      return [{
        id: 'legacy-config',
        name: cfg.activeProfile || 'default',
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
      }]
    }
  } catch (_) {}
  return picked
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

function captionPathForImage(imagePath) {
  return String(imagePath || '').replace(/\.[^.]+$/, '') + '.txt'
}

function readExistingCaptionTags(imagePath) {
  const captionPath = captionPathForImage(imagePath)
  try {
    if (!fs.existsSync(captionPath)) return []
    return parseWeightedCaption(fs.readFileSync(captionPath, 'utf-8'))
  } catch (_) {
    return []
  }
}

function isUnannotatedImage(imagePath, imageId) {
  if (imageId) {
    try {
      const rows = queryAll('SELECT tag_id FROM image_tags WHERE image_id = ? LIMIT 1', [imageId])
      if (rows.length) return false
    } catch (_) {}
  }
  return readExistingCaptionTags(imagePath).length === 0
}

async function resolveScopedImagePaths(params) {
  const scope = params.scope || 'all'
  let imagePaths = params.imagePaths || await getImagePaths(params.imageIds || [])
  const imageIds = params.imageIds || []
  if (scope === 'unannotated') {
    imagePaths = imagePaths.filter((imagePath, index) => isUnannotatedImage(imagePath, imageIds[index]))
  }
  return imagePaths
}

function resolveLocalModel(params) {
  const exists = (file) => {
    try { return !!(file && fs.existsSync(file)) } catch (_) { return false }
  }
  if (exists(params.modelPath)) return params
  try {
    const { scanModels } = require('./tagger-models')
    const { getModelDir } = require('./paths')
    const models = scanModels(getModelDir())
    if (models[0]) {
      params.modelPath = models[0].path
      params.csvPath = params.csvPath || models[0].csvPath
      params.normalization = params.normalization || models[0].normalization
      params.padColor = params.padColor || models[0].padColor
      params.resizeMode = params.resizeMode || models[0].resizeMode
      params.resolution = params.resolution || models[0].resolution
    }
  } catch (_) {}
  return params
}

async function generateTaggingResults(params, onProgress) {
  const report = typeof onProgress === 'function'
    ? onProgress
    : (typeof params?.onProgress === 'function' ? params.onProgress : null)
  await ensureDb()
  const imagePaths = await resolveScopedImagePaths(params)
  if (!imagePaths.length) return []

  const source = params.source || 'llm'
  if (source === 'local' || source === 'combined') {
    params = resolveLocalModel(params)
    if (!params.modelPath) {
      const err = new Error('请先选择一个可用的标注模型。')
      try { require('./app-log').writeAppLog('error', '[标注] ' + err.message, 'tagging') } catch (_) {}
      throw err
    }
  }
  const outputFormat = params.outputFormat || (source === 'natural' ? 'natural' : 'danbooru')
  const configs = resolveTaggingConfigs(params)
  const concurrency = Math.max(1, Math.min(8, Number(params.concurrency) || 1))
  const retries = Math.max(0, Math.min(4, Number(params.retries ?? 2)))
  const targetRpm = Math.max(0, Number(params.targetRpm) || 0)
  const intervalMs = targetRpm > 0 ? 60000 / targetRpm : 0

  const inferOptions = resolveInferOptions(params)
  let localResults = []
  if (source === 'local' || source === 'combined') {
    localResults = await runLocalInference({
      modelPath: params.modelPath,
      csvPath: params.csvPath,
      imagePaths,
      threshold: inferOptions.generalThreshold,
      generalThreshold: inferOptions.generalThreshold,
      characterThreshold: inferOptions.characterThreshold,
      addCharacter: inferOptions.addCharacter,
      addCopyright: inferOptions.addCopyright,
      replaceUnderscores: inferOptions.replaceUnderscores,
      batchSize: params.batchSize || 4,
      resolution: params.resolution || 448,
      providers: resolveTaggingProviders(params),
      normalization: params.normalization,
      padColor: params.padColor,
      resizeMode: params.resizeMode,
      inputLayout: params.inputLayout,
      signal: params.signal,
      onProgress: report,
    })
  }

  if (source === 'local') {
    return imagePaths.map((imagePath) => {
      const found = (localResults || []).find((item) => item.path === imagePath)
      return {
        imagePath,
        tags: applyPostprocessOptions(localResultToTagStrings(localResults, imagePath), { ...inferOptions, ...params }),
        natural: '',
        error: (() => {
        const message = found && found.error ? found.error : undefined
        if (message) {
          try { require('./app-log').writeAppLog('error', '[标注] ' + message + ' @ ' + imagePath, 'tagging') } catch (_) {}
        }
        return message
      })(),
      }
    })
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
        prompt: params.customPrompt || params.prompt,
        signal: params.signal,
        config: configs[index % configs.length],
      }), retries, params.signal)
      const mergeStrategy = params.mergeStrategy
      const mergedTags = source === 'combined' && mergeStrategy && mergeStrategy !== 'b_only'
        ? mergeTagLists(localTags, result.tags || [], mergeStrategy)
        : result.tags || []
      result.tags = applyPostprocessOptions(mergedTags, { ...inferOptions, ...params })
      if (report) {
        report({
          type: 'progress',
          completed: index + 1,
          total: imagePaths.length,
          currentFile: imagePath,
        })
      }
      return { imagePath, tags: result.tags || [], natural: result.natural || '' }
    } catch (error) {
      if (report) {
        report({
          type: 'progress',
          completed: index + 1,
          total: imagePaths.length,
          currentFile: imagePath,
        })
      }
      const message = error.message || String(error)
      try { require('./app-log').writeAppLog('error', '[标注] ' + message + ' @ ' + imagePath, 'tagging') } catch (_) {}
      return { imagePath, tags: [], natural: '', error: message }
    }
  }, { intervalMs })

  return results
}

function tagNameOf(tag) {
  if (typeof tag === 'string') return tag.trim()
  return String(tag?.tag || tag?.name || '').trim()
}

function dedupeTagSet(tags) {
  const seen = new Set()
  const result = []
  for (const tag of tags || []) {
    const name = tagNameOf(tag)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(typeof tag === 'string' ? name : { ...tag, tag: name })
  }
  return result
}

function applyConflictMode(existingTags, newTags, conflict = 'skip') {
  const existing = dedupeTagSet(existingTags)
  const incoming = dedupeTagSet(newTags)
  if (conflict === 'overwrite' || conflict === 'replace') return incoming
  if (conflict === 'mergePrefix') return dedupeTagSet([...incoming, ...existing])
  if (conflict === 'merge' || conflict === 'append' || conflict === 'mergeSuffix') {
    return dedupeTagSet([...existing, ...incoming])
  }
  if (existing.length) return existing
  return incoming
}
function applyWriteMode(existingTags, newTags, mode = 'skip') {
  return applyConflictMode(existingTags, newTags, mode)
}

function findImageIdByPath(imagePath) {
  const rows = queryAll('SELECT id FROM images WHERE path = ?', [imagePath])
  return rows[0]?.id ?? null
}

async function writeImageTagsAndCaption(imageId, imagePath, tags, captionOverride = '') {
  const entries = normalizeTagEntries(tags)
  const imageRows = imageId ? queryAll('SELECT path FROM images WHERE id = ?', [imageId]) : []
  const actualPath = imageRows[0]?.path || imagePath
  if (!actualPath) throw new Error('Image not found')

  if (imageId) {
    runSql('DELETE FROM image_tags WHERE image_id = ?', [imageId])
    for (const entry of entries) {
      runSql('INSERT OR IGNORE INTO tags (name, category) VALUES (?, ?)', [entry.tag, entry.category || 'general'])
      const tagRow = queryAll('SELECT id FROM tags WHERE name = ?', [entry.tag])[0]
      if (tagRow) {
        runSql('INSERT OR REPLACE INTO image_tags (image_id, tag_id, confidence, source, weight) VALUES (?, ?, ?, ?, ?)',
          [imageId, tagRow.id, entry.confidence ?? null, entry.source || 'manual', entry.weight ?? 1])
      }
    }
  }

  const captionPath = captionPathForImage(actualPath)
  const caption = captionOverride || serializeWeightedCaption(entries)
  const result = await writeTextSafe(captionPath, caption)
  if (!result.success) throw new Error(result.error || 'Failed to write caption')
}

async function applyTaggingResults(params) {
  await ensureDb()
  const results = params.results || []
  const failures = []
  let updated = 0
  const writeMode = params.conflict || params.writeMode || 'skip'

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
        const existing = readExistingCaptionTags(imagePath)
        const finalTags = applyWriteMode(existing, result.tags || [], writeMode)
        const caption = result.natural && finalTags.length === 0 ? result.natural : serializeWeightedCaption(normalizeTagEntries(finalTags))
        const writeResult = await writeTextSafe(captionPath, caption)
        if (!writeResult.success) throw new Error(writeResult.error || 'Write failed')
      } else {
        const existing = await getImageTagEntries(imageId)
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
  applyConflictMode,
  generateTaggingResults,
  resolveScopedImagePaths,
  normalizeTagEntries,
  getImagePaths,
  getImageTagNames,
  loadTemplates,
  saveTemplates,
  upsertTemplate,
  deleteTemplate,
  importTemplates,
  listTaggingConfigs,
  mapLimit,
  pickTaggingConfigs,
  resolveTaggingConfigs,
  runLocalInference,
  runOnnxInference,
  localResultToTagStrings,
  writeImageTagsAndCaption,
}

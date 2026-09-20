/**
 * Persisted tagging / model settings in baka-config.json.
 * Read by inferBatch, startRun, and generateTaggingResults.
 */
const fs = require('fs')
const path = require('path')
const { getConfigPath } = require('./paths')

const DEFAULT_TAGGING_SETTINGS = {
  generalThreshold: 0.35,
  characterThreshold: 0.85,
  addCharacter: true,
  addCopyright: true,
  replaceUnderscores: false,
  autoSaveAfterTagging: false,
  localModelDir: '',
  preferGpu: true,
}

const WD_CATEGORY = {
  general: 0,
  artist: 1,
  copyright: 3,
  character: 4,
  meta: 5,
}

function readRawConfig() {
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch (_) {}
  return {}
}

function toNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback
  return value === true || value === 'true' || value === 1 || value === '1'
}

function getTaggingSettings(raw = readRawConfig()) {
  const tagging = raw.tagging && typeof raw.tagging === 'object' ? raw.tagging : {}
  return {
    generalThreshold: toNumber(tagging.generalThreshold ?? raw.modelThreshold ?? raw.generalThreshold, DEFAULT_TAGGING_SETTINGS.generalThreshold),
    characterThreshold: toNumber(tagging.characterThreshold ?? raw.characterThreshold, DEFAULT_TAGGING_SETTINGS.characterThreshold),
    addCharacter: toBoolean(tagging.addCharacter, DEFAULT_TAGGING_SETTINGS.addCharacter),
    addCopyright: toBoolean(tagging.addCopyright, DEFAULT_TAGGING_SETTINGS.addCopyright),
    replaceUnderscores: toBoolean(tagging.replaceUnderscores ?? tagging.underscoreToSpace, DEFAULT_TAGGING_SETTINGS.replaceUnderscores),
    autoSaveAfterTagging: toBoolean(tagging.autoSaveAfterTagging, DEFAULT_TAGGING_SETTINGS.autoSaveAfterTagging),
    localModelDir: String(raw.localModelDir || tagging.localModelDir || ''),
    preferGpu: toBoolean(tagging.preferGpu ?? raw.preferGpu, DEFAULT_TAGGING_SETTINGS.preferGpu),
  }
}

function saveTaggingSettings(partial = {}) {
  const raw = readRawConfig()
  const current = getTaggingSettings(raw)
  const next = { ...current, ...partial }
  if (partial.localModelDir !== undefined) raw.localModelDir = String(partial.localModelDir || '')
  raw.tagging = {
    generalThreshold: next.generalThreshold,
    characterThreshold: next.characterThreshold,
    addCharacter: next.addCharacter,
    addCopyright: next.addCopyright,
    replaceUnderscores: next.replaceUnderscores,
    autoSaveAfterTagging: next.autoSaveAfterTagging,
    preferGpu: next.preferGpu === true,
  }
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf-8')
  return getTaggingSettings(raw)
}

function resolveInferOptions(params = {}) {
  const settings = getTaggingSettings()
  const generalThreshold = toNumber(params.generalThreshold ?? params.threshold, settings.generalThreshold)
  return {
    generalThreshold,
    characterThreshold: toNumber(params.characterThreshold, settings.characterThreshold),
    addCharacter: params.addCharacter === undefined ? settings.addCharacter : Boolean(params.addCharacter),
    addCopyright: params.addCopyright === undefined ? settings.addCopyright : Boolean(params.addCopyright),
    replaceUnderscores: params.replaceUnderscores === undefined ? settings.replaceUnderscores : Boolean(params.replaceUnderscores),
    autoSaveAfterTagging: params.autoSaveAfterTagging === undefined ? settings.autoSaveAfterTagging : Boolean(params.autoSaveAfterTagging),
    threshold: generalThreshold,
  }
}

function categoryKey(category) {
  const n = Number(category)
  if (n === WD_CATEGORY.character || category === 'character') return 'character'
  if (n === WD_CATEGORY.copyright || category === 'copyright') return 'copyright'
  return 'general'
}

function filterPredictedTags(tags, options = {}) {
  const resolved = {
    generalThreshold: toNumber(options.generalThreshold ?? options.threshold, DEFAULT_TAGGING_SETTINGS.generalThreshold),
    characterThreshold: toNumber(options.characterThreshold, DEFAULT_TAGGING_SETTINGS.characterThreshold),
    addCharacter: options.addCharacter !== false,
    addCopyright: options.addCopyright !== false,
    replaceUnderscores: Boolean(options.replaceUnderscores),
  }
  const result = []
  for (const item of tags || []) {
    const tag = typeof item === 'string' ? { tag: item, category: 0, confidence: 1 } : item
    const name = String(tag.tag || tag.name || '').trim()
    if (!name) continue
    const kind = categoryKey(tag.category)
    if (kind === 'character' && !resolved.addCharacter) continue
    if (kind === 'copyright' && !resolved.addCopyright) continue
    const confidence = Number(tag.confidence)
    const threshold = kind === 'character' ? resolved.characterThreshold : resolved.generalThreshold
    if (Number.isFinite(confidence) && confidence < threshold) continue
    result.push({
      ...tag,
      tag: resolved.replaceUnderscores ? name.replace(/_/g, ' ') : name,
      category: kind === 'character' ? 'character' : kind === 'copyright' ? 'copyright' : (tag.category || 'general'),
    })
  }
  return result
}


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

const CPU_FALLBACK_LOG = "GPU 超时（DirectML），已改用 CPU 继续标注"

function resolveTaggingProviders(params = {}) {
  const settings = getTaggingSettings()
  const requested = (Array.isArray(params.providers) ? params.providers : [])
    .map((item) => String(item || '').toLowerCase().trim())
    .filter(Boolean)
  const wantGpu = params.preferGpu !== false && settings.preferGpu !== false
  if (!wantGpu) return ['cpu']
  let available = []
  try { available = require('./tagger-models').detectProviders() } catch (_) {}
  const gpu = requested.filter((name) => name && name !== 'cpu')
  if (gpu.length) return [...new Set([...gpu, 'cpu'])]
  if (available.includes('dml') || wantGpu) return ['dml', 'cpu']
  return ['cpu']
}
function registerTaggerSettingsHandlers() {
  const { ipcMain } = require('electron')
  ipcMain.handle('taggerSettings:get', async () => {
    try {
      return { success: true, data: getTaggingSettings() }
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })
  ipcMain.handle('taggerSettings:save', async (_event, partial) => {
    try {
      return { success: true, data: saveTaggingSettings(partial || {}) }
    } catch (error) {
      return { success: false, error: error.message || String(error) }
    }
  })
}

module.exports = {
  DEFAULT_TAGGING_SETTINGS,
  WD_CATEGORY,
  getTaggingSettings,
  saveTaggingSettings,
  resolveInferOptions,
  resolveTaggingProviders,
  isDmlTdrError,
  CPU_FALLBACK_LOG,
  filterPredictedTags,
  registerTaggerSettingsHandlers,
}

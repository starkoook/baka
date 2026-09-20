const METADATA_CACHE_VERSION = 7

const MODEL_WEIGHT_EXT_RE = /\.(safetensors|ckpt|pt|gguf)\b/i
const LORA_BLOB_MARKER_RE = /text_encoder_weight|loraWorks|"lora"\s*:|lora_str/
const WEILIN_CAPTION_RE = /<artwork\b|WeiLinPrompt/i
const RAW_LORA_SIGNAL_RE = /lora|LoraLoader|LoRALoader|lora_str|temp_lora_str|<lora:/i

function isModelLoraBlobPrompt(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return false
  // WeiLin artwork XML is the caption itself, even if it mentions weights.
  if (trimmed.startsWith('<')) return false
  if (MODEL_WEIGHT_EXT_RE.test(trimmed) && LORA_BLOB_MARKER_RE.test(trimmed)) return true
  if ((trimmed.startsWith('[') || trimmed.startsWith('{')) && LORA_BLOB_MARKER_RE.test(trimmed)) return true
  return false
}

function stampMetadataCache(meta) {
  return { ...(meta || {}), metadataCacheVersion: METADATA_CACHE_VERSION }
}

function parseCachedMetadata(raw) {
  if (raw == null || raw === '') return null
  try {
    const cached = typeof raw === 'string' ? JSON.parse(raw) : raw
    return cached && typeof cached === 'object' ? cached : null
  } catch (_) {
    return null
  }
}

function galleryCacheNeedsReparse(cached) {
  if (!cached || typeof cached !== 'object') return true
  const version = Number(cached.metadataCacheVersion) || 0
  if (version < METADATA_CACHE_VERSION) return true
  if (isModelLoraBlobPrompt(cached.prompt)) return true
  const prompt = typeof cached.prompt === 'string' ? cached.prompt.trim() : ''
  const rawText = cached.rawMetadata ? JSON.stringify(cached.rawMetadata) : ''
  if (!prompt && WEILIN_CAPTION_RE.test(rawText)) return true
  const hasRawLoraSignal = RAW_LORA_SIGNAL_RE.test(rawText)
  const cachedHasLoras = Array.isArray(cached.loras) && cached.loras.length > 0
  if (hasRawLoraSignal && !cachedHasLoras) return true
  return false
}

/** Scan/import skip: only force-reparse known-bad captions, not every unversioned row. */
function galleryIndexCacheIsReusable(sdMetadata) {
  const cached = parseCachedMetadata(sdMetadata)
  if (!cached) return false
  if (isModelLoraBlobPrompt(cached.prompt)) return false
  const prompt = typeof cached.prompt === 'string' ? cached.prompt.trim() : ''
  const rawText = cached.rawMetadata ? JSON.stringify(cached.rawMetadata) : ''
  if (!prompt && WEILIN_CAPTION_RE.test(rawText)) return false
  return true
}

module.exports = {
  METADATA_CACHE_VERSION,
  isModelLoraBlobPrompt,
  stampMetadataCache,
  parseCachedMetadata,
  galleryCacheNeedsReparse,
  galleryIndexCacheIsReusable,
}

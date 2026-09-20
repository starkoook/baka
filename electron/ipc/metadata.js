const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

/**
 * Parse SD metadata from PNG tEXt/iTXt/zTXt chunks.
 * Supports ComfyUI, WebUI/A1111, Forge, and NovelAI formats.
 */

function readPngChunks(filePath) {
  try {
    const buf = fs.readFileSync(filePath)
    // Check PNG signature
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
      return null // not a PNG
    }
    const chunks = {}
    let offset = 8
    while (offset < buf.length - 4) {
      const len = buf.readUInt32BE(offset)
      const type = buf.toString('ascii', offset + 4, offset + 8)
      const data = buf.slice(offset + 8, offset + 8 + len)
      offset += 12 + len

      if (type === 'tEXt') {
        const nullIdx = data.indexOf(0)
        if (nullIdx > 0) {
          const keyword = data.toString('ascii', 0, nullIdx)
          const text = data.toString('utf8', nullIdx + 1)
          chunks[keyword] = text
        }
      } else if (type === 'iTXt') {
        const keywordEnd = data.indexOf(0)
        if (keywordEnd > 0 && keywordEnd + 2 < data.length) {
          const keyword = data.toString('utf8', 0, keywordEnd)
          const compressed = data[keywordEnd + 1] === 1
          let cursor = keywordEnd + 3
          const languageEnd = data.indexOf(0, cursor)
          if (languageEnd < 0) continue
          cursor = languageEnd + 1
          const translatedEnd = data.indexOf(0, cursor)
          if (translatedEnd < 0) continue
          cursor = translatedEnd + 1
          try {
            chunks[keyword] = compressed
              ? zlib.inflateSync(data.slice(cursor)).toString('utf8')
              : data.toString('utf8', cursor)
          } catch (_) {}
        }
      } else if (type === 'zTXt') {
        const nullIdx1 = data.indexOf(0)
        if (nullIdx1 > 0) {
          const keyword = data.toString('ascii', 0, nullIdx1)
          try {
            const decompressed = zlib.inflateSync(data.slice(nullIdx1 + 2))
            chunks[keyword] = decompressed.toString('utf8')
          } catch (_) {}
        }
      }
    }
    return chunks
  } catch (_) {
    return null
  }
}

function parseWebUIParameters(paramsStr) {
  const result = { generator: 'WebUI' }
  const lines = paramsStr.split('\n')

  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    const blob = parseModelLoraBlob(firstLine)
    if (blob) mergeModelLoraBlob(result, blob)
    else result.prompt = firstLine
  }

  const loras = []
  const loraPattern = /<lora:([^:>]+):([+-]?(?:\d+(?:\.\d+)?|\.\d+))>/gi
  for (const match of paramsStr.matchAll(loraPattern)) {
    loras.push({ name: match[1].trim(), weight: Number(match[2]) })
  }
  if (loras.length && !(result.loras && result.loras.length)) result.loras = loras

  for (const line of lines) {
    if (line.startsWith('Negative prompt:')) {
      result.negative = line.replace('Negative prompt:', '').trim()
    }
    const stepsMatch = line.match(/Steps:\s*(\d+)/i)
    if (stepsMatch) result.steps = parseInt(stepsMatch[1])
    const samplerMatch = line.match(/Sampler:\s*([^,]+)/i)
    if (samplerMatch) result.sampler = samplerMatch[1].trim()
    const cfgMatch = line.match(/CFG scale:\s*([\d.]+)/i)
    if (cfgMatch) result.cfg = parseFloat(cfgMatch[1])
    const seedMatch = line.match(/Seed:\s*(\d+)/i)
    if (seedMatch) result.seed = parseInt(seedMatch[1])
    const sizeMatch = line.match(/Size:\s*(\d+)x(\d+)/i)
    if (sizeMatch) { result.width = parseInt(sizeMatch[1]); result.height = parseInt(sizeMatch[2]) }
    const modelMatch = line.match(/Model:\s*(.+?)(?:,\s*|$)/i) || line.match(/Model hash:\s*\w+,\s*Model:\s*(.+?)(?:,|$)/i)
    if (modelMatch && !result.model) result.model = modelMatch[1].trim()
  }

  return result
}

function parseEmbeddedJsonList(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

function normalizeLora(item) {
  if (!item || typeof item !== 'object' || item.hidden === true) return null
  const name = item.name || item.lora || item.lora_name
  if (typeof name !== 'string' || !name.trim()) return null

  const weightValue = item.weight ?? item.strength_model ?? item.strength ?? 1
  const textEncoderValue = item.text_encoder_weight ?? item.strength_clip
  const weight = Number(weightValue)
  const textEncoderWeight = textEncoderValue === undefined ? undefined : Number(textEncoderValue)
  const normalized = {
    name: name.replace(/\.safetensors$/i, '').trim(),
    weight: Number.isFinite(weight) ? weight : 1,
  }
  const displayName = item.display_name || item.displayName
  if (typeof displayName === 'string' && displayName.trim()) normalized.displayName = displayName.trim()
  if (Number.isFinite(textEncoderWeight)) normalized.textEncoderWeight = textEncoderWeight
  return normalized
}

function collectComfyLoras(nodes) {
  const loras = []
  const seen = new Set()
  const add = (item) => {
    const normalized = normalizeLora(item)
    if (!normalized) return
    const key = `${normalized.name.toLowerCase()}|${normalized.weight}|${normalized.textEncoderWeight ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    loras.push(normalized)
  }

  for (const node of nodes) {
    const inputs = node?.inputs || {}
    const classType = String(node?.class_type || '')
    if (typeof inputs.lora_str === 'string' || Array.isArray(inputs.lora_str)) {
      parseEmbeddedJsonList(inputs.lora_str).forEach(add)
    }

    const loraName = inputs.lora_name
    if ((classType.includes('LoraLoader') || classType.includes('LoRALoader') || classType === 'Lora') && typeof loraName === 'string') {
      add({
        name: loraName.split(/[/\\]/).pop(),
        weight: inputs.strength_model ?? inputs.strength ?? inputs.strength_clip ?? 1,
        text_encoder_weight: inputs.strength_clip,
      })
    }
  }

  return loras
}

/**
 * Strip trailing JSON arrays/objects from prompt text.
 * NovelAI and some ComfyUI workflows append token metadata.
 */
function cleanPromptText(text) {
  if (typeof text !== 'string') return text
  let t = text.trim()

  // WeiLin artwork XML is the caption itself. Never empty it as a model+LoRA blob; only drop a trailing token array after </artwork>.
  if (/^<artwork\b/i.test(t)) {
    for (const prefix of [', [{"id":"token_', '[{"id":"token_']) {
      const tokenIdx = t.lastIndexOf(prefix)
      if (tokenIdx > 0) {
        t = t.slice(0, tokenIdx).trim()
        if (t.endsWith(',')) t = t.slice(0, -1).trim()
        return t
      }
    }
    return t
  }

  // Detect NovelAI/ComfyUI token array: [{"id":"token_...}]
  // "tokenIdx > 0" is enough — the pattern is specific, no false positives.
  for (const prefix of [', [{"id":"token_', '[{"id":"token_']) {
    const tokenIdx = t.lastIndexOf(prefix)
    if (tokenIdx > 0) {
      t = t.slice(0, tokenIdx).trim()
      if (t.endsWith(',')) t = t.slice(0, -1).trim()
      return t
    }
  }

  // Model filename + LoRA JSON: "foo.safetensors, [{...lora...}]"
  let searchFrom = 0
  while (searchFrom < t.length) {
    const loraJsonIdx = t.indexOf(', [', searchFrom)
    if (loraJsonIdx < 0) break
    const remainder = t.slice(loraJsonIdx + 2).trim()
    if (isLoraJsonPayload(remainder) || isLoraJsonPayload(t.slice(loraJsonIdx))) {
      t = t.slice(0, loraJsonIdx).trim()
      if (t.endsWith(',')) t = t.slice(0, -1).trim()
      break
    }
    searchFrom = loraJsonIdx + 3
  }

  if (isModelFilenameOnly(t)) return ''
  return t
}

function isXmlLikeText(text) {
  return typeof text === 'string' && text.trim().startsWith('<') && text.includes('</')
}

function extractPromptFromStructuredText(text) {
  if (typeof text !== 'string') return null
  const match = text.match(/"prompt"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (!match) return null
  let extracted
  try {
    extracted = JSON.parse(`"${match[1]}"`)
  } catch (_) {
    extracted = match[1]
  }
  if (parseModelLoraBlob(extracted)) return null
  return extracted
}

const MODEL_FILENAME_RE = /\.(safetensors|ckpt|pt|gguf)\b/i
const LORA_JSON_MARKER_RE = /text_encoder_weight|loraWorks|"lora"\s*:/
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/
const SKIP_TEXT_KEYS = new Set([
  'ckpt_name', 'unet_name', 'model_name',
  'clip_name', 'clip_name1', 'clip_name2',
  'vae_name', 'lora_name', 'lora_str', 'lora', 'loras',
])

function isLoraLikeItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false
  return (
    'lora' in item ||
    'lora_name' in item ||
    'text_encoder_weight' in item ||
    'loraWorks' in item ||
    (typeof item.name === 'string' && (item.weight !== undefined || item.strength !== undefined))
  )
}

function isLoraJsonPayload(text) {
  if (typeof text !== 'string' || !text.trim()) return false
  if (LORA_JSON_MARKER_RE.test(text)) return true
  const trimmed = text.trim()
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return false
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed.some(isLoraLikeItem)
    return isLoraLikeItem(parsed)
  } catch (_) {
    return false
  }
}

function isModelFilenameOnly(text) {
  if (typeof text !== 'string') return false
  const t = text.trim()
  if (!t || t.includes('\n') || t.includes(', ')) return false
  return /\.(safetensors|ckpt|pt|gguf)$/i.test(t)
}

function parseLoraArray(value) {
  if (!Array.isArray(value) || !value.length) return null
  if (!value.some(isLoraLikeItem)) return null
  return value.map(normalizeLora).filter(Boolean)
}

/**
 * Parse a model-filename + LoRA JSON blob (or a bare LoRA array).
 * This is NOT a caption. Returns { model, loras, prompt: undefined } or null.
 */
function parseModelLoraBlob(text) {
  if (typeof text !== 'string') return null
  const t = text.trim()
  if (!t) return null

  if (t.startsWith('[')) {
    try {
      const loras = parseLoraArray(JSON.parse(t))
      if (loras === null) return null
      return { model: undefined, loras, prompt: undefined }
    } catch (_) {
      return null
    }
  }

  const extMatch = t.match(/\.(safetensors|ckpt|pt|gguf)\b/i)
  if (!extMatch) return null

  const extEnd = extMatch.index + extMatch[0].length
  const modelPart = t.slice(0, extEnd).trim()
  if (!modelPart || modelPart.includes('\n')) return null
  // A caption glued in front of a model file is not itself a blob.
  if (modelPart.includes(', ')) return null

  const rest = t.slice(extEnd).trim()
  if (!rest) {
    if (!isModelFilenameOnly(t)) return null
    return { model: path.basename(modelPart), loras: [], prompt: undefined }
  }

  if (!rest.startsWith(',')) return null
  const jsonPart = rest.slice(1).trim()
  if (!jsonPart.startsWith('[')) return null
  try {
    const loras = parseLoraArray(JSON.parse(jsonPart))
    if (loras === null) return null
    return { model: path.basename(modelPart), loras, prompt: undefined }
  } catch (_) {
    return null
  }
}

/** Cached sd_prompt that is a model filename + LoRA dump, not a caption. */
function isModelLoraBlobPrompt(value) {
  if (typeof value !== 'string') return false
  const t = value.trim()
  if (!t) return false
  // WeiLin artwork XML is the caption itself, even if it mentions weights.
  if (t.startsWith('<')) return false
  if (parseModelLoraBlob(t)) return true
  return MODEL_FILENAME_RE.test(t) && LORA_JSON_MARKER_RE.test(t)
}

function mergeModelLoraBlob(result, blob) {
  if (!result || !blob) return
  if (blob.model && !result.model) result.model = blob.model
  if (!blob.loras || !blob.loras.length) return
  if (!result.loras || !result.loras.length) {
    result.loras = blob.loras
    return
  }
  const seen = new Set(result.loras.map((lora) => String(lora.name).toLowerCase() + '|' + lora.weight + '|' + (lora.textEncoderWeight ?? '')))
  for (const lora of blob.loras) {
    const key = String(lora.name).toLowerCase() + '|' + lora.weight + '|' + (lora.textEncoderWeight ?? '')
    if (seen.has(key)) continue
    seen.add(key)
    result.loras.push(lora)
  }
}

function sanitizeRawMetadata(result) {
  const rawMeta = result && result.rawMetadata
  if (!rawMeta || typeof rawMeta !== 'object') return

  if (typeof rawMeta.prompt === 'string' && parseModelLoraBlob(rawMeta.prompt)) {
    delete rawMeta.prompt
  }

  if (typeof rawMeta.parameters === 'string') {
    const lines = rawMeta.parameters.split('\n')
    if (lines.length && parseModelLoraBlob(lines[0].trim())) {
      const remaining = lines.slice(1).join('\n').trim()
      if (remaining) rawMeta.parameters = remaining
      else delete rawMeta.parameters
    }
  }

  if (Object.keys(rawMeta).length === 0) delete result.rawMetadata
}

function looksLikeCaption(text) {
  if (typeof text !== 'string' || text.length <= 15) return false
  if (text.includes(',')) return true
  if (CJK_RE.test(text)) return true
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length >= 3 && /[A-Za-z]/.test(text)
}

function isPromptLike(text) {
  if (typeof text !== 'string' || text.length <= 15) return false
  if (MODEL_FILENAME_RE.test(text)) return false
  if (isLoraJsonPayload(text)) return false
  return looksLikeCaption(text)
}

function isNegativeLike(text) {
  return typeof text === 'string' && text.length > 5 && (
    text.startsWith('negative') || text.startsWith('nsfw') || text.startsWith('lowres') ||
    text.startsWith('bad') || text.startsWith('worst') || text.includes('bad anatomy') ||
    text.includes('low quality')
  )
}

function collectTexts(obj, depth) {
  if (depth > 10 || !obj || typeof obj !== 'object') return []
  const texts = []
  for (const [key, val] of Object.entries(obj)) {
    if (SKIP_TEXT_KEYS.has(key)) continue
    if (isPromptLike(val)) {
      texts.push({ key, text: val })
    } else if (typeof val === 'object' && val !== null) {
      texts.push(...collectTexts(val, depth + 1))
    }
  }
  return texts
}

function sourceHint(node) {
  const properties = node?.properties || {}
  const repository = properties.repo_url || properties.repository || properties.project_url
  const registryId = properties.cnr_id || properties.aux_id
  if (!repository && !registryId) return null
  return {
    nodeType: node.type,
    registryId: registryId || undefined,
    repository: repository || undefined,
  }
}

function isWeiLinCaptionNodeType(type) {
  if (typeof type !== 'string' || !/WeiLin/i.test(type)) return false
  if (/OnlyLoraStack/i.test(type)) return false
  if (/Lora/i.test(type) && !/WithoutLora/i.test(type)) return false
  return true
}

function isComfyNodeLink(val) {
  return Array.isArray(val) && val.length >= 1 && (typeof val[0] === 'string' || typeof val[0] === 'number')
}

function promptStringFromNode(node) {
  if (!node || typeof node !== 'object') return null
  const inputs = node.inputs || {}
  for (const key of ['positive', 'text', 'prompt']) {
    if (typeof inputs[key] === 'string' && inputs[key].trim()) return inputs[key]
  }
  if (Array.isArray(node.widgets_values)) {
    for (const val of node.widgets_values) {
      if (typeof val === 'string' && val.trim()) return val
    }
  }
  return null
}

function resolveLinkedPrompt(data, link) {
  if (!isComfyNodeLink(link) || !data || typeof data !== 'object') return null
  return promptStringFromNode(data[String(link[0])])
}

function classifyXmlCaption(text) {
  if (typeof text !== 'string') return null
  const embedded = extractPromptFromStructuredText(text)
  if (embedded) return embedded
  // WeiLin artwork XML has no "prompt": key — the XML itself is the caption.
  if (!/"prompt"\s*:/.test(text)) return text
  return null
}

function isLiteGraphPromptNodeType(type) {
  if (typeof type !== 'string' || !type.trim()) return false
  if (isWeiLinCaptionNodeType(type)) return true
  const promptLike = /CLIPTextEncode|CLIPTextEncodeSDXL|CLIPTextEncodeFlux|TextEncodeQwen|Prompt|WeiLin|Textbox|PrimitiveString|StringLiteral|ShowText|CR Prompt|DPRandom/i
  if (!promptLike.test(type)) return false
  const skipLike = /Negative|Lora|LoRA|Checkpoint|Loader|SaveImage|Preview|VAE|UNET/i
  if (skipLike.test(type) && !/TextEncode/i.test(type)) return false
  return true
}

function collectWidgetStrings(widgetsValues) {
  if (!Array.isArray(widgetsValues)) return []
  const out = []
  for (const val of widgetsValues) {
    if (typeof val === 'string' && val.trim()) out.push(val)
    else if (val && typeof val === 'object' && typeof val.string === 'string' && val.string.trim()) {
      out.push(val.string)
    }
  }
  return out
}

/**
 * Read captions from LiteGraph workflow.nodes[] (type + widgets_values).
 * These are the real CLIP/text widgets; the PNG "prompt" chunk is often a model+LoRA blob.
 */
function extractPromptsFromLiteGraph(nodes) {
  if (!Array.isArray(nodes)) return {}
  const prompts = []
  const negatives = []
  const extraLoras = []

  for (const node of nodes) {
    if (!isLiteGraphPromptNodeType(node && node.type)) continue
    for (const raw of collectWidgetStrings(node.widgets_values)) {
      const blob = parseModelLoraBlob(raw)
      if (blob) {
        if (blob.loras && blob.loras.length) extraLoras.push(...blob.loras)
        continue
      }
      if (isModelFilenameOnly(raw)) continue
      if (isXmlLikeText(raw)) {
        const xmlCaption = classifyXmlCaption(raw)
        if (!xmlCaption) continue
        const cleanedXml = cleanPromptText(xmlCaption)
        if (cleanedXml && cleanedXml.length >= 2) {
          if (isNegativeLike(cleanedXml)) negatives.push(cleanedXml)
          else prompts.push(cleanedXml)
        }
        continue
      }
      const cleaned = cleanPromptText(raw)
      if (!cleaned || cleaned.length < 2) continue
      if (isNegativeLike(cleaned)) negatives.push(cleaned)
      else prompts.push(cleaned)
    }
  }

  const result = {}
  if (prompts.length) result.prompt = [...new Set(prompts)].join(', ')
  if (negatives.length) result.negative = [...new Set(negatives)].join(', ')
  if (extraLoras.length) result.extraLoras = extraLoras
  return result
}

function parseComfyUIWorkflow(raw) {
  try {
    const workflow = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(workflow?.nodes)) {
      return { workflow: undefined, nodeTypes: [], sourceHints: [] }
    }
    const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
    const extracted = extractPromptsFromLiteGraph(nodes)
    const result = {
      workflow,
      nodeTypes: [...new Set(nodes.map(node => node?.type).filter(Boolean))],
      sourceHints: nodes.map(sourceHint).filter(Boolean),
    }
    if (extracted.prompt) result.prompt = extracted.prompt
    if (extracted.negative) result.negative = extracted.negative
    if (extracted.extraLoras && extracted.extraLoras.length) {
      mergeModelLoraBlob(result, { loras: extracted.extraLoras })
    }
    return result
  } catch (_) {
    return { workflow: undefined, nodeTypes: [], sourceHints: [] }
  }
}

function sanitizeJsonLike(text) {
  if (typeof text !== 'string') return text
  return text
    .replace(/(?<=[\s:,\[])NaN(?=[\s,\]\}])/g, 'null')
    .replace(/(?<=[\s:,\[])-Infinity(?=[\s,\]\}])/g, 'null')
    .replace(/(?<=[\s:,\[])Infinity(?=[\s,\]\}])/g, 'null')
}

function parseComfyUIPrompt(promptJson) {
  try {
    const data = JSON.parse(sanitizeJsonLike(promptJson))
    const result = { generator: 'ComfyUI' }

    const nodes = Object.values(data).filter(node => node && typeof node === 'object')
    result.nodeTypes = [...new Set(nodes.map(node => node.class_type).filter(Boolean))]
    result.sourceHints = nodes
      .map(node => sourceHint({ type: node.class_type, properties: node.properties }))
      .filter(Boolean)

    // Search ALL nodes for params and prompts
    const allTexts = []
    for (const [nodeId, node] of Object.entries(data)) {
      const ct = node.class_type || ''

      // Extract steps, cfg, sampler, seed from any ksampler-like node
      if (node.inputs) {
        if (node.inputs.steps !== undefined) result.steps = node.inputs.steps
        if (node.inputs.cfg !== undefined) result.cfg = node.inputs.cfg
        if (node.inputs.sampler_name) result.sampler = node.inputs.sampler_name
        if (node.inputs.seed !== undefined) result.seed = node.inputs.seed
        if (node.inputs.noise_seed !== undefined && result.seed === undefined) result.seed = node.inputs.noise_seed
      }

      // ── Model / VAE / CLIP extraction ──
      if (node.inputs) {
        // Checkpoint (bundled: UNET + CLIP + VAE)
        if (ct === 'CheckpointLoaderSimple' || ct === 'CheckpointLoader') {
          const ckpt = node.inputs.ckpt_name
          if (ckpt && typeof ckpt === 'string') {
            result.model = ckpt.split(/[/\\]/).pop()
            result.modelType = 'checkpoint'
          }
        }
        // UNET (separate)
        if (node.inputs.unet_name && typeof node.inputs.unet_name === 'string' && !result.model) {
          result.model = node.inputs.unet_name.split(/[/\\]/).pop()
          result.modelType = 'unet'
        }
        // CLIP
        if (ct === 'CLIPLoader' || ct === 'DualCLIPLoader') {
          const clipName = node.inputs.clip_name || node.inputs.clip_name1
          if (clipName && typeof clipName === 'string') {
            result.clip = clipName.split(/[/\\]/).pop()
          }
          if (ct === 'DualCLIPLoader' && node.inputs.clip_name2) {
            result.clip = (result.clip || '') + ' + ' + node.inputs.clip_name2.split(/[/\\]/).pop()
          }
        }
        // VAE
        if (ct === 'VAELoader' && node.inputs.vae_name && typeof node.inputs.vae_name === 'string') {
          result.vae = node.inputs.vae_name.split(/[/\\]/).pop()
        }
        // Also try to extract from CheckpointLoaderSimple's bundled output
        if (ct === 'CheckpointLoaderSimple' || ct === 'CheckpointLoader') {
          if (!result.clip) result.clip = '内置'
          if (!result.vae) result.vae = '内置'
        }
        // Generic model name fallback
        const modelKey = node.inputs.ckpt_name || node.inputs.model_name
        if (modelKey && typeof modelKey === 'string' && !result.model) {
          result.model = modelKey.split(/[/\\]/).pop()
        }
      }

      // Collect all input texts for prompt detection
      if (node.inputs) {
        const texts = collectTexts(node.inputs, 0)
        allTexts.push(...texts.map(t => ({ ...t, nodeId })))
        if (isLiteGraphPromptNodeType(ct) || isWeiLinCaptionNodeType(ct)) {
          for (const key of ['positive', 'text', 'prompt']) {
            const val = node.inputs[key]
            if (isComfyNodeLink(val)) {
              const resolved = resolveLinkedPrompt(data, val)
              if (typeof resolved === 'string' && resolved.trim().length >= 2) {
                if (!parseModelLoraBlob(resolved) && !isModelFilenameOnly(resolved)) {
                  allTexts.push({ key, text: resolved, nodeId, preferred: true })
                }
              }
              continue
            }
            if (typeof val !== 'string') continue
            const trimmed = val.trim()
            if (trimmed.length < 2) continue
            if (parseModelLoraBlob(trimmed) || isModelFilenameOnly(trimmed)) continue
            allTexts.push({ key, text: val, nodeId, preferred: true })
          }
        }
      }
      if (Array.isArray(node.widgets_values)) {
        for (const val of node.widgets_values) {
          if (typeof val !== 'string' || !val.trim()) continue
          const widgetBlob = parseModelLoraBlob(val)
          if (widgetBlob) {
            mergeModelLoraBlob(result, widgetBlob)
            continue
          }
          allTexts.push({ key: 'widgets_values', text: val, nodeId })
        }
      }
    }

    const loras = collectComfyLoras(nodes)
    if (loras.length) result.loras = loras

    // Classify texts into prompts and negatives
    const prompts = []
    const negatives = []
    const preferredMinLen = new Set()
    for (const t of allTexts) {
      if (isNegativeLike(t.text)) {
        negatives.push(t.text)
      } else if (isXmlLikeText(t.text)) {
        const xmlCaption = classifyXmlCaption(t.text)
        if (xmlCaption) {
          prompts.push(xmlCaption)
          if (t.preferred) preferredMinLen.add(xmlCaption)
        }
      } else if (t.preferred) {
        prompts.push(t.text)
        preferredMinLen.add(t.text)
      } else if (isPromptLike(t.text)) {
        prompts.push(t.text)
      }
    }

    // Deduplicate and clean prompts. Filter blobs PER ITEM so a real caption
    // joined with a leftover model+LoRA dump is not wiped as a whole.
    const seen = new Set()
    const cleanedPrompts = prompts
      .filter(p => { const s = p.slice(0, 60); if (seen.has(s)) return false; seen.add(s); return true })
      .map((p) => ({ text: cleanPromptText(p), preferred: preferredMinLen.has(p) }))
      .filter((p) => p.text && (p.preferred ? p.text.length >= 2 : p.text.length > 5))
    const survivors = []
    for (const item of cleanedPrompts) {
      const blob = parseModelLoraBlob(item.text)
      if (blob) {
        mergeModelLoraBlob(result, blob)
        continue
      }
      survivors.push(item.text)
    }
    result.prompt = survivors.length ? survivors.join(', ') : undefined
    if (negatives.length > 0) {
      const cleanedNegs = negatives
        .filter(p => { const s = p.slice(0, 60); if (seen.has(s)) return false; seen.add(s); return true })
        .map(cleanPromptText)
        .filter(p => p && p.length > 5)
      result.negative = cleanedNegs.join(', ')
    }
    if (!result.prompt) result.prompt = undefined
    return result
  } catch (_) {
    return { generator: 'ComfyUI' }
  }
}

function parseNovelAIComment(commentText) {
  // Try JSON first (newer NovelAI / compatible formats)
  try {
    const data = JSON.parse(commentText)
    return {
      generator: 'NovelAI',
      prompt: cleanPromptText(data.prompt || data.description || ''),
      negative: cleanPromptText(data.uc || data.negative_prompt || ''),
      steps: data.steps || data.samples || undefined,
      sampler: data.sampler || data.sm_dyn || undefined,
      cfg: data.scale || data.cfg_scale || undefined,
      seed: data.seed || undefined,
      width: data.width || undefined,
      height: data.height || undefined,
      model: data.model || undefined,
    }
  } catch (_) {
    // Not JSON — parse as raw text
  }

  // Clean up the text: strip trailing JSON arrays/objects
  let text = cleanPromptText(commentText)

  // NovelAI uses "nsfw," or "rating:" as positive/negative boundary
  let prompt = text
  let negative = ''
  const separators = [', nsfw,', ', nsfw,{{', 'rating:explicit,', 'rating:general,']
  for (const sep of separators) {
    const idx = text.indexOf(sep)
    if (idx > 0) {
      negative = text.slice(0, idx).trim()
      prompt = text.slice(idx + sep.length).trim().replace(/^\{+/,'').replace(/\}+$/,'')
      break
    }
  }

  // Strip NovelAI emphasis markers {{ }} for cleaner display
  prompt = prompt.replace(/\{\{+/g, '').replace(/\}\}+/g, '')
  negative = negative.replace(/\{\{+/g, '').replace(/\}\}+/g, '')

  // Clean up excessive commas and spaces
  prompt = prompt.replace(/,{2,}/g, ',').replace(/\s*,/g, ',').replace(/,\s*/g, ', ').trim()
  negative = negative.replace(/,{2,}/g, ',').replace(/\s*,/g, ',').replace(/,\s*/g, ', ').trim()

  return {
    generator: 'NovelAI',
    prompt: prompt.slice(0, 2000),
    negative: negative.slice(0, 2000) || undefined,
  }
}

/**
 * Main entry point: parse SD metadata from any supported image format.
 * Returns an object with at least { hasMetadata: boolean }.
 */
function parseMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase()

  let result = { hasMetadata: false }

  if (ext === '.png') {
    const chunks = readPngChunks(filePath)
    if (!chunks) return result

    const promptChunk = chunks['prompt']
    const commentChunk = chunks['Comment']
    const workflowData = parseComfyUIWorkflow(chunks['workflow'])

    if (workflowData.workflow) {
      result = { generator: 'ComfyUI', hasMetadata: true, ...workflowData }
    } else if (chunks['workflow']) {
      result = { ...result, ...parseComfyUIPrompt(chunks['workflow']), hasMetadata: true }
    }

    if (promptChunk) {
      const keptPrompt = result.prompt
      const keptNegative = result.negative
      const applyApiPrompt = (promptData) => {
        const { nodeTypes, sourceHints, ...promptMetadata } = promptData
        result = { ...result, ...promptMetadata, hasMetadata: true }
        // Do not let an empty API parse wipe a caption already found in the workflow.
        if (!result.prompt && keptPrompt) result.prompt = keptPrompt
        if (!result.negative && keptNegative) result.negative = keptNegative
        if (!result.workflow) {
          result.nodeTypes = nodeTypes
          result.sourceHints = sourceHints
        }
      }
      if (promptChunk.includes('class_type')) {
        applyApiPrompt(parseComfyUIPrompt(promptChunk))
      } else if (promptChunk.trim().startsWith('{')) {
        applyApiPrompt(parseComfyUIPrompt(promptChunk))
      } else {
        const blob = parseModelLoraBlob(promptChunk)
        if (blob) {
          mergeModelLoraBlob(result, blob)
          result.hasMetadata = true
          if (keptPrompt) result.prompt = keptPrompt
          if (keptNegative) result.negative = keptNegative
        }
      }
    }

    if (!result.hasMetadata && chunks['parameters']) {
      result = parseWebUIParameters(chunks['parameters'])
      result.hasMetadata = true
      if (!result.generator) result.generator = chunks['parameters'].includes('Forge') ? 'Forge' : 'WebUI'
    }

    if (!result.hasMetadata && commentChunk) {
      if (commentChunk.includes('class_type')) {
        result = parseComfyUIPrompt(commentChunk)
        result.hasMetadata = true
      } else {
        result = parseNovelAIComment(commentChunk)
        result.hasMetadata = true
      }
    }

    if (!result.hasMetadata) {
      for (const [key, value] of Object.entries(chunks)) {
        if (key === 'Comment' || key === 'prompt' || key === 'parameters') continue
        if (typeof value === 'string' && value.length > 50) {
          if (value.includes('class_type')) {
            result = parseComfyUIPrompt(value)
            result.hasMetadata = true
            break
          }
          if (value.includes(',') || value.includes('\n')) {
            result = parseNovelAIComment(value)
            result.hasMetadata = true
            break
          }
        }
      }
    }

    if (Object.keys(chunks).length > 0) {
      result.rawMetadata = chunks
      result.hasMetadata = true
    }
  }

  // ── Final cleanup: strip trailing JSON token arrays from all prompt fields ──
  if (result.hasMetadata) {
    if (result.prompt) {
      const blob = parseModelLoraBlob(result.prompt)
      if (blob) {
        result.prompt = undefined
        mergeModelLoraBlob(result, blob)
      } else {
        result.prompt = cleanPromptText(result.prompt)
        if (result.prompt) {
          const leftover = parseModelLoraBlob(result.prompt)
          if (leftover) {
            result.prompt = undefined
            mergeModelLoraBlob(result, leftover)
          }
        }
      }
    }
    if (result.negative) result.negative = cleanPromptText(result.negative)
    sanitizeRawMetadata(result)
  }

  return result
}

module.exports = { parseMetadata, parseComfyUIPrompt, parseComfyUIWorkflow, extractPromptsFromLiteGraph, sourceHint, collectComfyLoras, cleanPromptText, isModelLoraBlobPrompt }

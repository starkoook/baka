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
    result.prompt = lines[0].trim()
  }

  const loras = []
  const loraPattern = /<lora:([^:>]+):([+-]?(?:\d+(?:\.\d+)?|\.\d+))>/gi
  for (const match of paramsStr.matchAll(loraPattern)) {
    loras.push({ name: match[1].trim(), weight: Number(match[2]) })
  }
  if (loras.length) result.loras = loras

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

  return t
}

function isXmlLikeText(text) {
  return typeof text === 'string' && text.trim().startsWith('<') && text.includes('</')
}

function extractPromptFromStructuredText(text) {
  if (typeof text !== 'string') return null
  const match = text.match(/"prompt"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (!match) return null
  try {
    return JSON.parse(`"${match[1]}"`)
  } catch (_) {
    return match[1]
  }
}

function isPromptLike(text) {
  return typeof text === 'string' && text.length > 15 && (text.includes(',') || text.includes('（') || text.includes('('))
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

function parseComfyUIWorkflow(raw) {
  try {
    const workflow = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(workflow?.nodes)) {
      return { workflow: undefined, nodeTypes: [], sourceHints: [] }
    }
    const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
    return {
      workflow,
      nodeTypes: [...new Set(nodes.map(node => node?.type).filter(Boolean))],
      sourceHints: nodes.map(sourceHint).filter(Boolean),
    }
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
      }
    }

    const loras = collectComfyLoras(nodes)
    if (loras.length) result.loras = loras

    // Classify texts into prompts and negatives
    const prompts = []
    const negatives = []
    for (const t of allTexts) {
      if (isNegativeLike(t.text)) {
        negatives.push(t.text)
      } else if (isXmlLikeText(t.text)) {
        const embeddedPrompt = extractPromptFromStructuredText(t.text)
        if (embeddedPrompt) prompts.push(embeddedPrompt)
      } else if (t.text.length > 20) {
        prompts.push(t.text)
      }
    }

    // Deduplicate and clean prompts
    const seen = new Set()
    const cleanedPrompts = prompts
      .filter(p => { const s = p.slice(0, 60); if (seen.has(s)) return false; seen.add(s); return true })
      .map(cleanPromptText)
      .filter(p => p && p.length > 5) // remove token arrays that were stripped to empty
    result.prompt = cleanedPrompts.join(', ')
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
      if (promptChunk.includes('class_type')) {
        const promptData = parseComfyUIPrompt(promptChunk)
        const { nodeTypes, sourceHints, ...promptMetadata } = promptData
        result = { ...result, ...promptMetadata, hasMetadata: true }
        if (!result.workflow) {
          result.nodeTypes = nodeTypes
          result.sourceHints = sourceHints
        }
      } else if (promptChunk.trim().startsWith('{')) {
        const promptData = parseComfyUIPrompt(promptChunk)
        const { nodeTypes, sourceHints, ...promptMetadata } = promptData
        result = { ...result, ...promptMetadata, hasMetadata: true }
        if (!result.workflow) {
          result.nodeTypes = nodeTypes
          result.sourceHints = sourceHints
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
    if (result.prompt) result.prompt = cleanPromptText(result.prompt)
    if (result.negative) result.negative = cleanPromptText(result.negative)
  }

  return result
}

module.exports = { parseMetadata, parseComfyUIWorkflow, sourceHint, collectComfyLoras }

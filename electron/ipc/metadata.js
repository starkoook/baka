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
        const parts = []
        let start = 0
        for (let i = 0; i < 5 && start < data.length; i++) {
          const nullIdx = data.indexOf(0, start)
          if (nullIdx < 0) break
          parts.push(data.toString('utf8', start, nullIdx))
          start = nullIdx + 1
        }
        if (parts.length >= 5 && start < data.length) {
          const keyword = parts[0]
          const text = data.toString('utf8', start)
          chunks[keyword] = text
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

function parseComfyUIPrompt(promptJson) {
  try {
    const data = JSON.parse(promptJson)
    const result = { generator: 'ComfyUI' }

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

      // Extract LoRA
      if (ct.includes('LoraLoader') || ct.includes('Lora')) {
        if (!result.loras) result.loras = []
        const loraName = node.inputs?.lora_name || ''
        const weight = node.inputs?.strength_model ?? node.inputs?.strength ?? node.inputs?.strength_clip ?? 1
        if (loraName) {
          result.loras.push({ name: loraName.split(/[/\\]/).pop(), weight })
        }
      }

      // Collect all input texts for prompt detection
      if (node.inputs) {
        const texts = collectTexts(node.inputs, 0)
        allTexts.push(...texts.map(t => ({ ...t, nodeId })))
      }
    }

    // Classify texts into prompts and negatives
    const prompts = []
    const negatives = []
    for (const t of allTexts) {
      if (isNegativeLike(t.text)) {
        negatives.push(t.text)
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

    if (promptChunk) {
      if (promptChunk.includes('class_type')) {
        result = parseComfyUIPrompt(promptChunk)
        result.hasMetadata = true
      } else if (promptChunk.trim().startsWith('{')) {
        result = parseComfyUIPrompt(promptChunk)
        result.hasMetadata = true
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
  }

  // ── Final cleanup: strip trailing JSON token arrays from all prompt fields ──
  if (result.hasMetadata) {
    if (result.prompt) result.prompt = cleanPromptText(result.prompt)
    if (result.negative) result.negative = cleanPromptText(result.negative)
  }

  return result
}

module.exports = { parseMetadata }

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const sharp = require('sharp')

// Default config
const defaultConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  outputFormat: 'danbooru', // 'natural' | 'danbooru' | 'both'
  temperature: 0.3,
  maxTokens: 500,
}

// ── Prompt templates ──
function buildPrompt(format, customPrompt, threshold) {
  if (customPrompt) return customPrompt

  const detail = threshold ? `Use a low confidence threshold of ${threshold}. Include even subtle details, materials, textures, and background elements. Be extremely comprehensive.` : 'Be comprehensive but only list what is actually visible.'

  if (format === 'natural') {
    return `Describe this image in detailed natural language. Focus on character appearance, clothing, expression, pose, background, lighting, and art style. ${detail} Write a flowing paragraph suitable as an AI image generation prompt.`
  }

  if (format === 'both') {
    return `Analyze this image thoroughly. ${detail}

Output your response in this EXACT format:
<NL>
A detailed natural language description of the image.
</NL>
<TAGS>
All visible Danbooru-style tags, comma-separated. Include character features, clothing items, expressions, poses, backgrounds, quality tags, materials, textures.
Example: 1girl, long hair, blue eyes, school uniform, standing, looking at viewer, outdoor, day
</TAGS>`
  }

  return `You are an advanced, domain-agnostic Image Tagging Expert for training AI diffusion models (Stable Diffusion LoRA). Your sole task is to analyze the uploaded image and convert ALL visible visual elements into strict, comma-separated tags.

[CRITICAL RULES]
1. OUTPUT FORMAT: ONLY output individual tags separated by English commas (,). NO prose sentences. NO markdown blocks (\`\`\`). NO intro or outro.
2. DOMAIN ADAPTABILITY:
   - IF ANIME/MANGA: Output standard booru-style tags (character features, outfits, expressions, actions, art style).
   - IF REALISTIC/PHOTOGRAPHIC: Output granular keywords detailing microscopic material textures (leather pores, metallic reflections, surface grain, fabric weave), lighting conditions (rim light, ambient occlusion), camera angles, depth of field, and environmental details.
3. DETAIL EXTRACTION (macro to micro):
   - [Subject]: main objects, characters, creatures, materials
   - [Attributes]: colors, textures, patterns, materials, surface quality
   - [Composition]: framing, angle, lighting, background
   - [Micro-details]: small accessories, reflections, imperfections, wear marks, pores
4. Be EXHAUSTIVE. The confidence threshold is ${threshold || 0.25} — include everything you see, even subtle details.
5. Start directly with the first tag string. No preamble.`
}

// Config file path
function configPath() {
  const { getConfigPath } = require('./paths')
  return getConfigPath()
}

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(configPath())) {
      const raw = fs.readFileSync(configPath(), 'utf-8')
      return { ...defaultConfig, ...JSON.parse(raw) }
    }
  } catch (_) {}
  return { ...defaultConfig }
}

// Save config (only API settings — theme handled by renderer)
function saveApiConfig(partial) {
  const existing = loadConfig()
  const merged = { ...existing, ...partial }
  try {
    fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ── LLM API Call ──
// ── Resize image to avoid 413 ──
async function resizeBase64(base64, maxDim = 1024) {
  try {
    const buffer = Buffer.from(base64, 'base64')
    const img = sharp(buffer)
    const meta = await img.metadata()
    if (!meta.width || !meta.height) return base64 // can't read, use as-is
    if (meta.width <= maxDim && meta.height <= maxDim) return base64
    const resized = await img
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer()
    return resized.toString('base64')
  } catch (e) {
    console.error('[LLM] resize error:', e.message)
    return base64 // fallback to original
  }
}

async function callLLM(params) {
  const config = loadConfig()
  const provider = params.provider || config.provider
  const baseUrl = params.baseUrl || config.baseUrl
  const apiKey = params.apiKey || config.apiKey
  const model = params.model || config.model
  const format = params.outputFormat || config.outputFormat || 'danbooru'
  const temperature = Math.max(0.1, Math.min(2, params.temperature ?? config.temperature ?? 0.3))
  const maxTokens = params.maxTokens ?? config.maxTokens
  let imageBase64 = params.imageBase64
  const mimeType = params.mimeType || 'image/jpeg'

  if (!apiKey) throw new Error('API Key 未配置，请在设置中填写')

  // Build prompt
  const threshold = params.threshold
  const prompt = buildPrompt(format, params.prompt || null, threshold)

  // Resize image
  if (imageBase64) {
    imageBase64 = await resizeBase64(imageBase64, 1024)
  }

  // Call API
  let result
  if (provider === 'gemini') {
    result = await callGemini(baseUrl, apiKey, model, prompt, imageBase64, mimeType, temperature)
  } else {
    result = await callOpenAI(baseUrl, apiKey, model, prompt, imageBase64, mimeType, temperature, maxTokens)
  }

  // Parse structured output
  return parseOutput(result.raw || '', format)
}

// ── OpenAI-compatible API ──
async function callOpenAI(baseUrl, apiKey, model, prompt, imageBase64, mimeType = 'image/jpeg', temperature = 0.3, maxTokens = 300) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'

  // Build message content: with or without image
  const content = imageBase64
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ]
    : prompt

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content }],
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const raw = (data.choices?.[0]?.message?.content || '').trim()
  console.log('[LLM OpenAI] raw response:', raw.slice(0, 300))
  if (!raw) console.log('[LLM OpenAI] FULL response:', JSON.stringify(data).slice(0, 500))
  return { raw }
}

// ── Gemini API ──
async function callGemini(baseUrl, apiKey, model, prompt, imageBase64, mimeType = 'image/jpeg', temperature = 0.3) {
  const url = baseUrl.replace(/\/$/, '') + `/v1beta/models/${model}:generateContent?key=${apiKey}`

  const parts = imageBase64
    ? [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }]
    : [{ text: prompt }]

  const body = {
    contents: [{ parts }],
    generationConfig: { temperature, maxOutputTokens: 500 },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API 错误 ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return { raw }
}

// ── Structured output parser ──
function parseOutput(raw, format) {
  if (!raw || !raw.trim()) return { tags: [], natural: '' }

  // Try XML extraction for 'both' format
  const nlMatch = raw.match(/<NL>([\s\S]*?)<\/NL>/i)
  const tagsMatch = raw.match(/<TAGS>([\s\S]*?)<\/TAGS>/i)

  if (nlMatch || tagsMatch) {
    return {
      natural: (nlMatch?.[1] || '').trim(),
      tags: parseTagList(tagsMatch?.[1] || ''),
    }
  }

  // If no XML tags found, use format hint
  if (format === 'natural') {
    return { tags: [], natural: raw.trim() }
  }

  // Default: treat as tag list
  return { tags: parseTagList(raw), natural: '' }
}

// ── Robust universal tag parser ──
function parseTagList(text) {
  if (!text || !text.trim()) return []
  // 1. Strip markdown code blocks
  let cleaned = text.replace(/```[\s\S]*?```/g, '').replace(/`{1,3}/g, '')
  // 2. Normalize all delimiters to commas
  cleaned = cleaned.replace(/[\n\r;；]+/g, ',').replace(/，/g, ',')
  // 3. Split, clean, filter
  return cleaned
    .split(',')
    .map((t) => t.trim()
      .replace(/\\/g, '')           // remove backslashes
      .replace(/["']/g, '')         // remove quotes
      .replace(/^[•\-*.)\s]+/, '')  // strip bullet prefixes
      .trim()
    )
    .filter((t) => t.length > 0 && t.length < 100 && !/^[{}[\]]/.test(t))
}

// ── Register IPC handlers ──
function registerLLMHandlers() {
  // ── Test API connection ──
  ipcMain.handle('llm:test', async (_event, params) => {
    try {
      const config = loadConfig()
      const provider = params?.provider || config.provider
      const baseUrl = params?.baseUrl || config.baseUrl
      const apiKey = params?.apiKey || config.apiKey

      if (!apiKey) return { success: false, error: '请先填写 API Key' }

      let result
      if (provider === 'gemini') {
        // Gemini: send a real test prompt
        const testRes = await callGemini(baseUrl, apiKey, params?.model || config.model, 'Reply with exactly "OK" and nothing else.', null)
        const reply = testRes.raw?.trim() || ''
        if (!reply) {
          return { success: false, error: `Gemini 返回空内容。模型 "${params?.model || config.model}" 可能不支持。请确认模型名正确。` }
        }
        result = `Gemini 连接成功! 测试回复: "${reply.slice(0, 100)}"`
      } else {
        // OpenAI: send a tiny test request
        const testRes = await callOpenAI(
          baseUrl, apiKey, params?.model || config.model,
          'Reply with exactly "OK" and nothing else.',
          null, 'image/jpeg', 0.1, 10
        )
        const reply = testRes.raw?.trim() || ''
        if (!reply) {
          return { success: false, error: `模型返回空内容。请确认 "${params?.model || config.model}" 是有效的模型名称。原始响应: ${JSON.stringify(testRes).slice(0, 300)}` }
        }
        result = `连接成功! 测试回复: "${reply.slice(0, 100)}"`
      }

      return { success: true, message: result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('llm:tag', async (_event, params) => {
    try {
      const { tags, natural } = await callLLM(params)
      return { success: true, tags, natural: natural || '' }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('llm:getConfig', async () => {
    return loadConfig()
  })

  ipcMain.handle('llm:saveConfig', async (_event, config) => {
    return saveApiConfig(config)
  })

  // ── Profiles ──
  ipcMain.handle('llm:getProfiles', async () => {
    const c = loadConfig()
    return { profiles: c.profiles || [], activeProfile: c.activeProfile || '' }
  })

  ipcMain.handle('llm:saveProfile', async (_event, profile) => {
    const c = loadConfig()
    const profiles = c.profiles || []
    const idx = profiles.findIndex((p) => p.name === profile.name)
    if (idx >= 0) profiles[idx] = profile
    else profiles.push(profile)
    return saveApiConfig({ profiles, activeProfile: profile.name })
  })

  ipcMain.handle('llm:switchProfile', async (_event, name) => {
    const c = loadConfig()
    const profiles = c.profiles || []
    const p = profiles.find((pr) => pr.name === name)
    if (!p) return { success: false, error: '配置文件未找到' }
    return saveApiConfig({
      provider: p.provider, baseUrl: p.baseUrl, apiKey: p.apiKey,
      model: p.model, activeProfile: name, profiles,
    })
  })

  ipcMain.handle('llm:deleteProfile', async (_event, name) => {
    const c = loadConfig()
    const profiles = (c.profiles || []).filter((p) => p.name !== name)
    const active = c.activeProfile === name ? '' : c.activeProfile
    return saveApiConfig({ profiles, activeProfile: active })
  })

  // ── List models from API ──
  ipcMain.handle('llm:listModels', async (_event, params) => {
    try {
      const config = loadConfig()
      const provider = params?.provider || config.provider
      const baseUrl = params?.baseUrl || config.baseUrl
      const apiKey = params?.apiKey || config.apiKey

      if (!apiKey) throw new Error('请先填写 API Key')

      let models = []
      if (provider === 'gemini') {
        const url = baseUrl.replace(/\/$/, '') + '/v1beta/models?key=' + apiKey
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        models = (data.models || [])
          .filter((m) => m.name?.includes('gemini'))
          .map((m) => m.name.replace('models/', ''))
      } else {
        // OpenAI-compatible
        const url = baseUrl.replace(/\/$/, '') + '/models'
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        models = (data.data || [])
          .map((m) => m.id)
          .sort()
      }

      return { success: true, models }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerLLMHandlers }

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

// Default config
const defaultConfig = {
  provider: 'openai',        // 'openai' | 'gemini'
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  prompt: 'Analyze this anime-style image and list all visible character tags, features, and attributes. Output ONLY as a comma-separated tag list, no explanations. Example format: 1girl, long hair, blue eyes, school uniform, ribbon, standing, looking at viewer',
  temperature: 0.3,
  maxTokens: 300,
}

// Config file path
function configPath() {
  return path.join(app.getPath('userData'), 'baka-config.json')
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
async function callLLM(params) {
  const config = loadConfig()
  const provider = params.provider || config.provider
  const baseUrl = params.baseUrl || config.baseUrl
  const apiKey = params.apiKey || config.apiKey
  const model = params.model || config.model
  const prompt = params.prompt || config.prompt
  const imageBase64 = params.imageBase64

  if (!apiKey) {
    throw new Error('API Key 未配置，请在设置中填写')
  }

  if (provider === 'gemini') {
    return callGemini(baseUrl, apiKey, model, prompt, imageBase64)
  }
  return callOpenAI(baseUrl, apiKey, model, prompt, imageBase64, params.temperature, params.maxTokens)
}

// ── OpenAI-compatible API ──
async function callOpenAI(baseUrl, apiKey, model, prompt, imageBase64, temperature = 0.3, maxTokens = 300) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions'

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${imageBase64}` },
          },
        ],
      },
    ],
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
    throw new Error(`API 错误 ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  return parseTags(data.choices?.[0]?.message?.content || '')
}

// ── Gemini API ──
async function callGemini(baseUrl, apiKey, model, prompt, imageBase64) {
  const url = baseUrl.replace(/\/$/, '') + `/v1beta/models/${model}:generateContent?key=${apiKey}`

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
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
  return parseTags(data.candidates?.[0]?.content?.parts?.[0]?.text || '')
}

// ── Tag parsing ──
function parseTags(raw) {
  // Split by comma, clean up whitespace and special chars
  return raw
    .split(/[,，\n]/)
    .map((t) => t.trim().replace(/^[•\-*\d.)\s]+/, '').trim())
    .filter((t) => t.length > 0 && t.length < 80)
}

// ── Register IPC handlers ──
function registerLLMHandlers() {
  ipcMain.handle('llm:tag', async (_event, params) => {
    try {
      const tags = await callLLM(params)
      return { success: true, tags }
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

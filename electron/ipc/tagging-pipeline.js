const PROMPT_TEMPLATES = [
  {
    id: 'danbooru-tags',
    name: 'Danbooru Tags',
    build: ({ extra = '' } = {}) => `You are a tagger. Output only comma-separated Danbooru tags. ${extra}`.trim(),
  },
  {
    id: 'natural',
    name: 'Natural Language',
    build: ({ extra = '' } = {}) => `Describe this image in natural language. ${extra}`.trim(),
  },
  {
    id: 'tags-and-natural',
    name: 'Tags + Natural',
    build: ({ extra = '' } = {}) => `Output <TAGS>...</TAGS> and <NL>...</NL>. ${extra}`.trim(),
  },
]

function buildPrompt(templateId, options = {}) {
  const template = PROMPT_TEMPLATES.find(item => item.id === templateId) || PROMPT_TEMPLATES[0]
  return template.build(options)
}

async function generateWithLlm({ imageBase64, mimeType, templateId, outputFormat = 'danbooru', config = {}, temperature, maxTokens, localTags = [], prompt: customPrompt, signal }) {
  const { callLLM } = require('./llm')
  const { postprocessTags, parseStructuredOutput } = require('./tagging-postprocess')
  const extra = localTags.length ? `Existing local tags: ${localTags.join(', ')}. Use them as a starting point.` : ''
  const prompt = customPrompt || buildPrompt(templateId, { extra })
  const result = await callLLM({
    imageBase64,
    mimeType,
    prompt,
    outputFormat,
    temperature,
    maxTokens,
    signal,
    provider: config.provider,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  })

  if (outputFormat === 'both') {
    const parsed = parseStructuredOutput(result.natural || '')
    if (parsed.tags.length) result.tags = parsed.tags
    if (parsed.natural) result.natural = parsed.natural
  }
  result.tags = postprocessTags(result.tags || [])
  return result
}

module.exports = { PROMPT_TEMPLATES, buildPrompt, generateWithLlm }

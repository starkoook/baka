const { callLLM } = require('./llm')

class LlmTagger {
  constructor(configs = []) {
    this.configs = configs
    this.index = 0
  }

  nextConfig() {
    if (this.configs.length === 0) return {}
    return this.configs[this.index++ % this.configs.length]
  }

  async generate({ imageBase64, mimeType, prompt, outputFormat = 'danbooru', temperature, maxTokens }) {
    const config = this.nextConfig()
    return callLLM({
      imageBase64,
      mimeType,
      prompt,
      outputFormat,
      temperature,
      maxTokens,
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    })
  }
}

module.exports = { LlmTagger }

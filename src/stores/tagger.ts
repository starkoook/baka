import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TagResult {
  tag: string
  confidence: number
  source?: 'local' | 'llm'
}

export const useTaggerStore = defineStore('tagger', () => {
  const selectedFile = ref<string | null>(null)
  const selectedModel = ref('wd14-vit-v2')
  const tagSource = ref<'local' | 'llm'>('llm')
  const isProcessing = ref(false)
  const results = ref<TagResult[]>([])
  const threshold = ref(0.35)
  const lastError = ref('')

  const localModels = [
    { value: 'wd14-vit-v2', label: 'WD14 ViT v2' },
    { value: 'wd14-convnext-v2', label: 'WD14 ConvNext v2' },
    { value: 'wd14-swinv2-v2', label: 'WD14 SwinV2 v2' },
    { value: 'deepdanbooru', label: 'DeepDanbooru' },
  ]

  // ── Local model tagging (placeholder) ──
  async function runLocalTagging() {
    if (!selectedFile.value) return
    isProcessing.value = true
    results.value = []
    lastError.value = ''

    // TODO: integrate ONNX models
    await new Promise((resolve) => setTimeout(resolve, 1000))
    results.value = [
      { tag: '1girl', confidence: 0.98, source: 'local' },
      { tag: 'solo', confidence: 0.95, source: 'local' },
      { tag: 'long_hair', confidence: 0.87, source: 'local' },
      { tag: 'school_uniform', confidence: 0.76, source: 'local' },
    ]

    isProcessing.value = false
  }

  // ── LLM tagging ──
  async function runLLMTagging(imageBase64?: string) {
    if (!window.llmAPI) {
      lastError.value = 'LLM API 不可用（请在 Electron 环境中运行）'
      return
    }
    isProcessing.value = true
    results.value = []
    lastError.value = ''

    try {
      const res = await window.llmAPI.tagImage({
        imageBase64: imageBase64 || '',
      })

      if (res.success && res.tags) {
        // Assign decreasing confidence to LLM-generated tags
        results.value = res.tags.map((tag, i) => ({
          tag,
          confidence: Math.max(0.99 - i * 0.01, 0.5),
          source: 'llm' as const,
        }))
      } else {
        lastError.value = res.error || '未知错误'
      }
    } catch (e: any) {
      lastError.value = e.message || 'LLM 调用失败'
    }

    isProcessing.value = false
  }

  // ── Unified run ──
  async function runTagging(imageBase64?: string) {
    if (!selectedFile.value) return
    if (tagSource.value === 'llm') {
      await runLLMTagging(imageBase64)
    } else {
      await runLocalTagging()
    }
  }

  function clearResults() {
    results.value = []
    selectedFile.value = null
    lastError.value = ''
  }

  return {
    selectedFile,
    selectedModel,
    tagSource,
    isProcessing,
    results,
    threshold,
    lastError,
    localModels,
    runTagging,
    runLLMTagging,
    clearResults,
  }
})

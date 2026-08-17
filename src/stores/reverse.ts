import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ReverseEngineMode = 'local' | 'cloud' | 'dual'

export interface ReverseResult {
  tags: string[]
  naturalText: string
  drawingPrompt: string
}

const STORAGE_KEY = 'baka-reverse-last'

export const useReverseStore = defineStore('reverse', () => {
  const imagePath = ref('')
  const imageBase64 = ref('')
  const imageMime = ref('image/jpeg')
  const engineMode = ref<ReverseEngineMode>('cloud')
  const modelPath = ref('')
  const threshold = ref(0.35)
  const tags = ref<string[]>([])
  const naturalText = ref('')
  const drawingPrompt = ref('')
  const isProcessing = ref(false)
  const lastError = ref('')

  function setResult(result: ReverseResult) {
    tags.value = [...result.tags]
    naturalText.value = result.naturalText
    drawingPrompt.value = result.drawingPrompt
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      imagePath: imagePath.value,
      engineMode: engineMode.value,
      modelPath: modelPath.value,
      threshold: threshold.value,
      tags: tags.value,
      naturalText: naturalText.value,
      drawingPrompt: drawingPrompt.value,
    }))
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (!saved || typeof saved !== 'object') return
      imagePath.value = typeof saved.imagePath === 'string' ? saved.imagePath : ''
      engineMode.value = ['local', 'cloud', 'dual'].includes(saved.engineMode) ? saved.engineMode : 'cloud'
      modelPath.value = typeof saved.modelPath === 'string' ? saved.modelPath : ''
      threshold.value = Number.isFinite(saved.threshold) ? saved.threshold : 0.35
      tags.value = Array.isArray(saved.tags) ? saved.tags.filter((tag: unknown) => typeof tag === 'string') : []
      naturalText.value = typeof saved.naturalText === 'string' ? saved.naturalText : ''
      drawingPrompt.value = typeof saved.drawingPrompt === 'string' ? saved.drawingPrompt : ''
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  function clear() {
    imagePath.value = ''
    imageBase64.value = ''
    tags.value = []
    naturalText.value = ''
    drawingPrompt.value = ''
    lastError.value = ''
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    imagePath,
    imageBase64,
    imageMime,
    engineMode,
    modelPath,
    threshold,
    tags,
    naturalText,
    drawingPrompt,
    isProcessing,
    lastError,
    setResult,
    persist,
    restore,
    clear,
  }
})

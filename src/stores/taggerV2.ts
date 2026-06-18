import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGalleryStore } from './gallery'

export interface TagResultV2 {
  tag: string
  confidence: number
  source?: string
}

export const useTaggerV2Store = defineStore('taggerV2', () => {
  // ── Model & config ──
  const models = ref<ModelInfo[]>([])
  const activeModelPath = ref('')
  const tagSource = ref<'local' | 'llm'>('local')
  const threshold = ref(0.35)
  const providers = ref<string[]>([])

  // ── Inference state ──
  const isProcessing = ref(false)
  const taskId = ref('')
  const batchCompleted = ref(0)
  const batchTotal = ref(0)
  const batchCurrentFile = ref('')
  const batchProvider = ref('')

  // ── Results ──
  const lastResults = ref<Map<string, TagResultV2[]>>(new Map())
  const lastError = ref('')

  // ── Computed ──
  const batchPercent = computed(() => {
    if (batchTotal.value === 0) return 0
    return Math.round((batchCompleted.value / batchTotal.value) * 100)
  })
  const batchVisible = computed(() => isProcessing.value)

  // ── Actions ──
  async function loadModels() {
    if (!window.taggerV2API) return
    const res = await window.taggerV2API.listModels()
    if (res.success && res.data) {
      models.value = res.data.models
      providers.value = res.data.providers
      if (models.value.length > 0 && !activeModelPath.value) {
        activeModelPath.value = models.value[0].path
      }
    }
  }

  async function inferBatch(imagePaths: string[]) {
    if (!window.taggerV2API || imagePaths.length === 0) return
    isProcessing.value = true
    batchCompleted.value = 0
    batchTotal.value = imagePaths.length
    lastError.value = ''

    const activeModel = models.value.find((m) => m.path === activeModelPath.value)
    if (!activeModel) {
      lastError.value = 'No model selected'
      isProcessing.value = false
      return
    }

    const res = await window.taggerV2API.inferBatch({
      modelPath: activeModel.path,
      csvPath: activeModel.csvPath || undefined,
      imagePaths,
      threshold: threshold.value,
      resolution: activeModel.resolution,
      providers: providers.value,
    })

    isProcessing.value = false

    if (res.success && res.data) {
      for (const r of res.data.results) {
        if (r.tags) {
          lastResults.value.set(r.path, r.tags)
        }
      }
      // Write back to gallery DB
      const galleryStore = useGalleryStore()
      const entries: { imageId: number; tags: { tag: string; confidence?: number; source: string }[] }[] = []
      for (const r of res.data.results) {
        if (!r.tags || r.tags.length === 0) continue
        const img = galleryStore.images.find((gi) => gi.path === r.path)
        if (!img) continue
        entries.push({
          imageId: img.id,
          tags: r.tags.map((t) => ({ tag: t.tag, confidence: t.confidence, source: tagSource.value })),
        })
      }
      if (entries.length > 0 && window.galleryAPI) {
        await window.galleryAPI.batchSetTags(entries)
        entries.forEach((e) => galleryStore.imageTags.delete(e.imageId))
      }
    } else {
      lastError.value = res.error || 'Unknown error'
    }
  }

  // Setup progress listener
  function setupProgressListener() {
    if (!window.taggerV2API) return
    window.taggerV2API.onProgress((event) => {
      if (event.type === 'progress') {
        batchCompleted.value = event.completed || 0
        batchTotal.value = event.total || batchTotal.value
        batchCurrentFile.value = event.currentFile || ''
        batchProvider.value = event.provider || ''
      }
      if (event.type === 'complete' || event.type === 'cancelled' || event.type === 'error') {
        isProcessing.value = false
      }
    })
  }

  // Clean up
  function reset() {
    isProcessing.value = false
    lastResults.value = new Map()
    lastError.value = ''
  }

  return {
    models, activeModelPath, tagSource, threshold, providers,
    isProcessing, taskId, batchCompleted, batchTotal, batchCurrentFile, batchProvider,
    lastResults, lastError, batchPercent, batchVisible,
    loadModels, inferBatch, setupProgressListener, reset,
  }
})

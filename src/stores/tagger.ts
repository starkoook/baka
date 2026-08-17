import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { GalleryHandoff, GalleryReturnContext } from '@/features/gallery/gallery-workflow'
import { useGalleryStore } from './gallery'

const SESSION_KEY = 'baka-tagger-session-v1'

export type TaggerPhase = 'setup' | 'running' | 'stopping' | 'review'
export type QueueStatus = 'pending' | 'running' | 'ready' | 'reviewed' | 'failed' | 'partial'

export interface TagResult {
  tag: string
  confidence: number
  source?: string
  category?: string
  weight?: number
}

export interface TagQueueItem {
  id: number | null
  path: string
  status: QueueStatus
  tags: TagResult[]
  error: string
  databaseSaved: boolean
  captionSaved: boolean
}

interface PersistedTaggerSession {
  version: 1
  phase: TaggerPhase
  currentIndex: number
  taskId: string
  queue: TagQueueItem[]
  returnContext: GalleryReturnContext | null
  config: {
    tagSource: 'local' | 'llm' | 'combined'
    threshold: number
    activeModelPath: string
  }
}

interface InferenceResult {
  path: string
  tags?: TagResult[]
  error?: string
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export const useTaggerStore = defineStore('tagger', () => {
  const phase = ref<TaggerPhase>('setup')
  const queue = ref<TagQueueItem[]>([])
  const currentIndex = ref(0)
  const returnContext = ref<GalleryReturnContext | null>(null)

  const models = ref<ModelInfo[]>([])
  const activeModelPath = ref('')
  const tagSource = ref<'local' | 'llm' | 'combined'>('local')
  const threshold = ref(0.35)
  const providers = ref<string[]>([])

  const taskId = ref('')
  const batchCompleted = ref(0)
  const batchTotal = ref(0)
  const batchCurrentFile = ref('')
  const batchProvider = ref('')
  const lastError = ref('')
  let progressListenerReady = false

  const currentItem = computed(() => queue.value[currentIndex.value] ?? null)
  const completedCount = computed(() => queue.value.filter((item) => item.status === 'ready' || item.status === 'reviewed').length)
  const failedCount = computed(() => queue.value.filter((item) => item.status === 'failed' || item.status === 'partial').length)
  const batchPercent = computed(() => batchTotal.value === 0 ? 0 : Math.round((batchCompleted.value / batchTotal.value) * 100))
  const hasUnfinishedWork = computed(() => queue.value.some((item) => item.status !== 'reviewed'))

  function persistSession() {
    if (queue.value.length === 0) {
      localStorage.removeItem(SESSION_KEY)
      return
    }
    const payload: PersistedTaggerSession = {
      version: 1,
      phase: phase.value,
      currentIndex: currentIndex.value,
      taskId: taskId.value,
      queue: queue.value,
      returnContext: returnContext.value,
      config: {
        tagSource: tagSource.value,
        threshold: threshold.value,
        activeModelPath: activeModelPath.value,
      },
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  }

  function restoreSession() {
    if (queue.value.length > 0) return false
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return false
    try {
      const saved = JSON.parse(raw) as PersistedTaggerSession
      if (saved.version !== 1 || !Array.isArray(saved.queue)) return false
      queue.value = saved.queue
      currentIndex.value = Math.min(Math.max(saved.currentIndex || 0, 0), Math.max(saved.queue.length - 1, 0))
      returnContext.value = saved.returnContext ?? null
      tagSource.value = saved.config?.tagSource ?? 'local'
      threshold.value = saved.config?.threshold ?? 0.35
      activeModelPath.value = saved.config?.activeModelPath ?? ''
      taskId.value = ''

      const interrupted = saved.phase === 'running' || saved.phase === 'stopping'
      if (interrupted) {
        queue.value = queue.value.map((item) => item.status === 'running'
          ? { ...item, status: 'failed', error: '上次标注任务被中断，可以重新尝试。' }
          : item)
        phase.value = 'review'
        persistSession()
      } else {
        phase.value = saved.phase
      }
      return true
    } catch {
      localStorage.removeItem(SESSION_KEY)
      return false
    }
  }

  function createQueueFromGallery(handoff: GalleryHandoff) {
    queue.value = handoff.items.map((item) => ({
      id: item.id,
      path: item.path,
      status: 'pending',
      tags: (item.tags ?? []).map((tag) => ({ ...tag, confidence: tag.confidence ?? 1 })),
      error: '',
      databaseSaved: false,
      captionSaved: false,
    }))
    returnContext.value = { ...handoff.returnContext, selectedIds: [...handoff.returnContext.selectedIds] }
    currentIndex.value = 0
    phase.value = 'setup'
    taskId.value = ''
    lastError.value = ''
    persistSession()
  }

  function appendPaths(paths: string[]) {
    const existing = new Set(queue.value.map((item) => item.path))
    for (const path of paths) {
      if (existing.has(path)) continue
      queue.value.push({
        id: null,
        path,
        status: 'pending',
        tags: [],
        error: '',
        databaseSaved: false,
        captionSaved: false,
      })
      existing.add(path)
    }
    persistSession()
  }

  function removeMissing(paths: string[]) {
    return removePaths(paths)
  }

  function removePaths(paths: string[]) {
    if (paths.length === 0) return 0
    const missing = new Set(paths)
    const before = queue.value.length
    queue.value = queue.value.filter((item) => !missing.has(item.path))
    if (currentIndex.value >= queue.value.length) {
      currentIndex.value = Math.max(0, queue.value.length - 1)
    }
    persistSession()
    return before - queue.value.length
  }

  async function loadModels() {
    if (!window.taggerV2API) return
    const response = await window.taggerV2API.listModels()
    if (!response.success || !response.data) {
      lastError.value = response.error || '无法读取标注模型。'
      return
    }
    models.value = response.data.models
    providers.value = response.data.providers
    if (!activeModelPath.value && models.value.length > 0) activeModelPath.value = models.value[0].path
  }

  function applyInferenceResults(results: InferenceResult[]) {
    for (const result of results) {
      const item = queue.value.find((candidate) => candidate.path === result.path)
      if (!item) continue
      if (result.error) {
        item.status = 'failed'
        item.error = result.error
        continue
      }
      item.tags = result.tags ?? []
      item.status = 'ready'
      item.error = ''
    }
    phase.value = 'review'
    const firstReviewable = queue.value.findIndex((item) => item.status === 'ready' || item.status === 'failed')
    if (firstReviewable >= 0) currentIndex.value = firstReviewable
    persistSession()
  }

  async function startRun() {
    if (!window.taggerV2API || queue.value.length === 0) return
    const model = models.value.find((candidate) => candidate.path === activeModelPath.value)
    if (!model) {
      lastError.value = '请先选择一个可用的标注模型。'
      return
    }

    phase.value = 'running'
    batchCompleted.value = 0
    batchTotal.value = queue.value.length
    lastError.value = ''
    queue.value.forEach((item) => {
      if (item.status !== 'reviewed') {
        item.status = 'pending'
        item.error = ''
      }
    })
    persistSession()

    try {
      const response = await window.taggerV2API.inferBatch({
        modelPath: model.path,
        csvPath: model.csvPath || undefined,
        imagePaths: queue.value.filter((item) => item.status !== 'reviewed').map((item) => item.path),
        threshold: threshold.value,
        resolution: model.resolution,
        providers: providers.value,
      })
      taskId.value = response.taskId || ''
      if (response.success && response.data) {
        applyInferenceResults(response.data.results)
        return
      }
      lastError.value = response.error || '自动标注失败。'
    } catch (error) {
      lastError.value = errorMessage(error, '自动标注失败。')
    }

    phase.value = 'review'
    queue.value.forEach((item) => {
      if (item.status === 'pending' || item.status === 'running') {
        item.status = 'failed'
        item.error = lastError.value
      }
    })
    persistSession()
  }

  async function stopRun() {
    if (phase.value !== 'running' && phase.value !== 'stopping') return
    phase.value = 'stopping'
    persistSession()
    const response = await window.taggerV2API?.cancel(taskId.value)
    if (response?.success) {
      phase.value = 'review'
      queue.value.forEach((item) => {
        if (item.status === 'running') item.status = 'failed'
      })
    } else {
      phase.value = 'running'
      lastError.value = response?.error || '停止请求没有成功，请稍后重试。'
    }
    persistSession()
  }

  function setupProgressListener() {
    if (!window.taggerV2API || progressListenerReady) return
    progressListenerReady = true
    window.taggerV2API.onProgress((event) => {
      if (event.taskId) taskId.value = event.taskId
      if (event.type === 'progress') {
        batchCompleted.value = event.completed ?? 0
        batchTotal.value = event.total ?? batchTotal.value
        batchCurrentFile.value = event.currentFile ?? ''
        batchProvider.value = event.provider ?? ''
        queue.value.forEach((item) => {
          if (item.status === 'running') item.status = 'pending'
          if (item.path === event.currentFile) item.status = 'running'
        })
        persistSession()
      }
    })
  }

  function retryFailed() {
    queue.value.forEach((item) => {
      if (item.status === 'failed' || item.status === 'partial') {
        item.status = 'pending'
        item.error = ''
      }
    })
    phase.value = 'setup'
    persistSession()
  }

  function setCurrentIndex(index: number) {
    if (index < 0 || index >= queue.value.length) return
    currentIndex.value = index
    persistSession()
  }

  async function saveCurrent() {
    const item = currentItem.value
    if (!item) return false
    if (!item.id) {
      item.status = 'failed'
      item.error = '这张图片还没有加入图库数据库，请先在图库中同步所在文件夹。'
      persistSession()
      return false
    }

    let response
    try {
      response = await window.galleryAPI.saveAnnotation({
        imageId: item.id,
        imagePath: item.path,
        tags: item.tags,
      })
    } catch (error) {
      const message = errorMessage(error, '保存标注失败。')
      item.status = 'failed'
      item.error = message
      lastError.value = message
      persistSession()
      return false
    }
    item.databaseSaved = response.databaseSaved
    item.captionSaved = response.captionSaved
    item.error = response.error || ''

    if (response.success && response.databaseSaved && response.captionSaved) {
      item.status = 'reviewed'
      item.error = ''
      useGalleryStore().imageTags.delete(item.id)
      persistSession()
      return true
    }

    item.status = response.partial ? 'partial' : 'failed'
    if (response.databaseSaved) useGalleryStore().imageTags.delete(item.id)
    persistSession()
    return false
  }

  async function saveAndNext() {
    const saved = await saveCurrent()
    if (!saved) return false
    const nextIndex = queue.value.findIndex((item, index) => index > currentIndex.value && item.status !== 'reviewed')
    if (nextIndex >= 0) currentIndex.value = nextIndex
    persistSession()
    return true
  }

  function replacePaths(mappings: { oldPath: string; newPath: string }[]) {
    const byOldPath = new Map(mappings.map((mapping) => [mapping.oldPath, mapping.newPath]))
    queue.value.forEach((item) => {
      item.path = byOldPath.get(item.path) ?? item.path
    })
    persistSession()
  }

  function consumeReturnContext() {
    const context = returnContext.value
    returnContext.value = null
    persistSession()
    return context
  }

  function clearCompletedSession() {
    if (hasUnfinishedWork.value) return false
    queue.value = []
    currentIndex.value = 0
    returnContext.value = null
    phase.value = 'setup'
    localStorage.removeItem(SESSION_KEY)
    return true
  }

  return {
    phase, queue, currentIndex, returnContext,
    models, activeModelPath, tagSource, threshold, providers,
    taskId, batchCompleted, batchTotal, batchCurrentFile, batchProvider, lastError,
    currentItem, completedCount, failedCount, batchPercent, hasUnfinishedWork,
    createQueueFromGallery, appendPaths, removeMissing, removePaths, loadModels, startRun, stopRun,
    setupProgressListener, applyInferenceResults, retryFailed, setCurrentIndex, saveCurrent, saveAndNext,
    replacePaths, persistSession, restoreSession, consumeReturnContext, clearCompletedSession,
  }
})

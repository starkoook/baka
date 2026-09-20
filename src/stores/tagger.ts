import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { GalleryHandoff, GalleryReturnContext } from '@/features/gallery/gallery-workflow'
import { compiledPrompt, loadLlmPromptState } from '@/components/tagger/llm-prompt-state'
import {
  deleteTaggerPreset,
  loadTaggerPresets,
  matchesPreset,
  saveTaggerPreset,
  type TaggerPreset,
  type TaggerPresetInput,
} from '@/features/tagger/presets'
import { toIpcPayload } from '@/lib/ipc-payload'
import { useGalleryStore } from './gallery'

const SESSION_KEY = 'baka-tagger-session-v1'

export type TaggerPhase = 'setup' | 'running' | 'stopping' | 'review'
export type QueueStatus = 'pending' | 'running' | 'ready' | 'reviewed' | 'failed' | 'partial'
export type TagBackend = 'local' | 'llm' | 'combined'
export type TagScope = 'selected' | 'all' | 'unannotated'
export type TagConflict = 'skip' | 'overwrite' | 'merge'

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
    tagSource: TagBackend
    threshold: number
    activeModelPath: string
    scope: TagScope
    conflict: TagConflict
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

const MISSING_API_KEY_HINT = '先到设置 → 接口填写 API 密钥'

function visibleLlmError(message?: string, fallback = '') {
  const text = String(message || '')
  if (/API Key/i.test(text) || text.includes('未配置') || text.includes('密钥') || text.includes(MISSING_API_KEY_HINT)) {
    return MISSING_API_KEY_HINT
  }
  return text || fallback
}


export const useTaggerStore = defineStore('tagger', () => {
  const phase = ref<TaggerPhase>('setup')
  const queue = ref<TagQueueItem[]>([])
  const currentIndex = ref(0)
  const returnContext = ref<GalleryReturnContext | null>(null)

  const models = ref<ModelInfo[]>([])
  const activeModelPath = ref('')
  const tagSource = ref<TagBackend>('local')
  const threshold = ref(0.35)
  const characterThreshold = ref(0.85)
  const addCharacter = ref(true)
  const addCopyright = ref(true)
  const replaceUnderscores = ref(false)
  const autoSaveAfterTagging = ref(false)
  const scope = ref<TagScope>('all')
  const conflict = ref<TagConflict>('skip')
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
        scope: scope.value,
        conflict: conflict.value,
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
      scope.value = saved.config?.scope ?? 'all'
      conflict.value = saved.config?.conflict ?? 'skip'
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

  async function loadTaggingSettings() {
    if (!window.taggerSettingsAPI) return
    const response = await window.taggerSettingsAPI.get()
    if (!response.success || !response.data) return
    threshold.value = response.data.generalThreshold
    characterThreshold.value = response.data.characterThreshold
    addCharacter.value = response.data.addCharacter
    addCopyright.value = response.data.addCopyright
    replaceUnderscores.value = response.data.replaceUnderscores
    autoSaveAfterTagging.value = response.data.autoSaveAfterTagging
  }

  async function persistTaggingSettings() {
    if (!window.taggerSettingsAPI) return
    await window.taggerSettingsAPI.save(toIpcPayload({
      generalThreshold: threshold.value,
      characterThreshold: characterThreshold.value,
      addCharacter: addCharacter.value,
      addCopyright: addCopyright.value,
      replaceUnderscores: replaceUnderscores.value,
      autoSaveAfterTagging: autoSaveAfterTagging.value,
    }))
  }

  function resolveRunTargets() {
    if (scope.value === 'selected') {
      const current = currentItem.value
      return current ? [current] : []
    }
    if (scope.value === 'unannotated') {
      return queue.value.filter((item) => item.status !== 'reviewed' && item.tags.length === 0)
    }
    return queue.value.filter((item) => item.status !== 'reviewed')
  }

  async function loadModels() {
    await loadTaggingSettings()
    if (!window.taggerV2API) return
    const response = await window.taggerV2API.listModels()
    if (!response.success || !response.data) {
      lastError.value = response.error || '无法读取标注模型。'
      try { void window.logAPI?.append?.(toIpcPayload({ type: 'error', message: '[标注] ' + lastError.value, source: 'tagging' })) } catch { /* */ }
      return
    }
    models.value = response.data.models
    providers.value = response.data.providers?.length ? response.data.providers : ['cpu']
    if (models.value.length > 0 && !models.value.some((model) => model.path === activeModelPath.value)) {
      activeModelPath.value = models.value[0].path
    }
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
    if (phase.value === 'running' || phase.value === 'stopping') return
    if (queue.value.length === 0) return
    const targets = resolveRunTargets()
    if (targets.length === 0) {
      lastError.value = scope.value === 'selected' ? '请先选择一张图片。' : '当前范围内没有可标注的图片。'
      return
    }
    const model = models.value.find((candidate) => candidate.path === activeModelPath.value)
    if (tagSource.value !== 'llm' && !model) {
      lastError.value = '请先选择一个可用的标注模型。'
      return
    }

    phase.value = 'running'
    batchCompleted.value = 0
    batchTotal.value = targets.length
    lastError.value = ''
    const targetPaths = new Set(targets.map((item) => item.path))
    queue.value.forEach((item) => {
      if (targetPaths.has(item.path) && item.status !== 'reviewed') {
        item.status = 'pending'
        item.error = ''
      }
    })
    persistSession()

    try {
      if (tagSource.value === 'local' && window.taggerV2API) {
        const response = await window.taggerV2API.inferBatch(toIpcPayload({
          modelPath: model!.path,
          csvPath: model!.csvPath || undefined,
          imagePaths: targets.map((item) => item.path),
          threshold: threshold.value,
          generalThreshold: threshold.value,
          characterThreshold: characterThreshold.value,
          addCharacter: addCharacter.value,
          addCopyright: addCopyright.value,
          replaceUnderscores: replaceUnderscores.value,
          resolution: model!.resolution,
          providers: [...providers.value],
          normalization: model!.normalization,
          padColor: Array.isArray(model!.padColor) ? [...model!.padColor] : model!.padColor,
          resizeMode: model!.resizeMode,
          inputLayout: model!.inputLayout,
        }))
        taskId.value = response.taskId || ''
        if (response.success && response.data) {
          applyInferenceResults(response.data.results)
          if (autoSaveAfterTagging.value) await autoSaveReadyItems()
          return
        }
        lastError.value = response.error || '自动标注失败。'
        try { void window.logAPI?.append?.(toIpcPayload({ type: 'error', message: '[标注] ' + lastError.value, source: 'tagging' })) } catch { /* */ }
      } else if (window.taggingAPI) {
        const task = `tagging_${Date.now()}`
        taskId.value = task
        const prompt = loadLlmPromptState()
        const compiled = compiledPrompt(prompt)
        let configs: WorkbenchApiConfig[] = []
        const listed = await window.taggingAPI.listConfigs()
        if (listed.success) configs = listed.data?.configs ?? []
        if (!configs.length && window.llmAPI?.listApiConfigs) {
          const fallback = await window.llmAPI.listApiConfigs()
          if (Array.isArray(fallback)) configs = fallback
        }
        const selected = configs.find((cfg) => String(cfg.apiKey || '').trim()) || configs[0]
        if ((tagSource.value === 'llm' || tagSource.value === 'combined') && !selected) {
          let hasFallbackKey = false
          try {
            const cfg = await window.llmAPI?.getConfig()
            hasFallbackKey = Boolean(String(cfg?.apiKey || '').trim())
          } catch {
            hasFallbackKey = false
          }
          if (!hasFallbackKey) {
            lastError.value = MISSING_API_KEY_HINT
            throw new Error(MISSING_API_KEY_HINT)
          }
        }
        const apiConfigIds = selected?.id ? [selected.id] : (configs[0]?.id ? [configs[0].id] : [])
        const targetRpm = selected && selected.targetRpm !== undefined && selected.targetRpm !== null
          ? Math.max(0, Number(selected.targetRpm) || 0)
          : 5
        const concurrency = selected?.requestMode === 'concurrent' ? 4 : 1
        const response = await window.taggingAPI.generate(toIpcPayload({
          source: tagSource.value,
          customPrompt: compiled,
          apiConfigIds: [...apiConfigIds],
          outputFormat: prompt.outputFormat,
          templateId: prompt.templateId,
          targetRpm,
          concurrency,
          imagePaths: targets.map((item) => item.path),
          taskId: task,
          modelPath: model?.path,
          csvPath: model?.csvPath || undefined,
          threshold: threshold.value,
          generalThreshold: threshold.value,
          characterThreshold: characterThreshold.value,
          addCharacter: addCharacter.value,
          addCopyright: addCopyright.value,
          replaceUnderscores: replaceUnderscores.value,
          providers: [...providers.value],
          padColor: Array.isArray(model?.padColor) ? [...model.padColor] : model?.padColor,
          normalization: model?.normalization,
          resizeMode: model?.resizeMode,
          inputLayout: model?.inputLayout,
          resolution: model?.resolution,
          scope: scope.value,
          conflict: conflict.value,
        }))
        if (response.success && response.data) {
          const firstErr = response.data.find((item) => item.error)?.error
          if (firstErr) lastError.value = visibleLlmError(firstErr)
          applyInferenceResults(response.data.map((item) => ({
            path: item.imagePath || '',
            tags: (item.tags || []).map((tag) => ({ tag, confidence: 1, source: tagSource.value })),
            error: item.error,
          })))
          if (autoSaveAfterTagging.value) {
            await window.taggingAPI.apply(toIpcPayload({ results: response.data, conflict: conflict.value }))
            await autoSaveReadyItems()
          }
          return
        }
        lastError.value = visibleLlmError(response.error, '自动标注失败。')
        try { void window.logAPI?.append?.(toIpcPayload({ type: 'error', message: '[标注] ' + lastError.value, source: 'tagging' })) } catch { /* */ }
      }
    } catch (error) {
      lastError.value = visibleLlmError(errorMessage(error, '自动标注失败。'))
      try { void window.logAPI?.append?.(toIpcPayload({ type: 'error', message: '[标注] ' + lastError.value, source: 'tagging' })) } catch { /* */ }
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
    const response = tagSource.value === 'local'
      ? await window.taggerV2API?.cancel(taskId.value)
      : await window.taggingAPI?.cancel(taskId.value)
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
      response = await window.galleryAPI.saveAnnotation(toIpcPayload({
        imageId: item.id,
        imagePath: item.path,
        tags: item.tags,
      }))
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

  // 批量工具改了磁盘上的 .txt 后，重新读取队列项目的标注，保持界面与磁盘一致
  async function reloadCaptionsFromDisk() {
    if (!window.fsAPI || !window.annotationToolsAPI) return
    for (const item of queue.value) {
      const captionPath = item.path.replace(/\.[^.]+$/, '') + '.txt'
      const response = await window.fsAPI.readText(captionPath)
      if (response.success && response.text !== undefined) {
        const text = String(response.text || '').trim()
        const tags = text
          .split(/[，,]+/)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .map((tag): TagResult => ({ tag, confidence: 1, source: 'manual' }))
        item.tags = tags
        item.status = tags.length ? 'ready' : 'pending'
      }
    }
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

  async function autoSaveReadyItems() {
    for (const item of queue.value) {
      if (item.status === 'ready' && item.id) await saveCurrentAt(item)
    }
    persistSession()
  }

  async function saveCurrentAt(item: TagQueueItem) {
    const previous = currentIndex.value
    const index = queue.value.indexOf(item)
    if (index >= 0) currentIndex.value = index
    await saveCurrent()
    currentIndex.value = previous
  }

  // ── 标注预设：一组参数存个名字，一键套用 ──
  const presets = ref<TaggerPreset[]>([])
  const presetInput = computed<TaggerPresetInput>(() => ({
    tagSource: tagSource.value,
    modelPath: activeModelPath.value,
    threshold: threshold.value,
    characterThreshold: characterThreshold.value,
    addCharacter: addCharacter.value,
    addCopyright: addCopyright.value,
    replaceUnderscores: replaceUnderscores.value,
  }))
  const activePresetId = computed(() => presets.value.find((preset) => matchesPreset(preset, presetInput.value))?.id ?? null)

  function presetStorage() {
    return typeof localStorage === 'undefined' ? null : localStorage
  }

  function loadPresets() {
    const storage = presetStorage()
    if (storage) presets.value = loadTaggerPresets(storage)
  }

  function savePreset(name: string) {
    const storage = presetStorage()
    if (!storage) return
    presets.value = saveTaggerPreset(storage, name, presetInput.value)
  }

  function deletePreset(id: string) {
    const storage = presetStorage()
    if (!storage) return
    presets.value = deleteTaggerPreset(storage, id)
  }

  function applyPreset(id: string): TaggerPreset | null {
    const preset = presets.value.find((item) => item.id === id)
    if (!preset) return null
    tagSource.value = preset.tagSource
    // 预设里的模型可能已经删掉了，那就保留当前模型
    if (preset.modelPath && models.value.some((model) => model.path === preset.modelPath)) activeModelPath.value = preset.modelPath
    threshold.value = preset.threshold
    characterThreshold.value = preset.characterThreshold
    addCharacter.value = preset.addCharacter
    addCopyright.value = preset.addCopyright
    replaceUnderscores.value = preset.replaceUnderscores
    persistSession()
    void persistTaggingSettings()
    return preset
  }

  return {
    presets, activePresetId, loadPresets, savePreset, deletePreset, applyPreset,
    phase, queue, currentIndex, returnContext,
    models, activeModelPath, tagSource, threshold, characterThreshold, addCharacter, addCopyright,
    replaceUnderscores, autoSaveAfterTagging, scope, conflict, providers,
    taskId, batchCompleted, batchTotal, batchCurrentFile, batchProvider, lastError,
    currentItem, completedCount, failedCount, batchPercent, hasUnfinishedWork,
    createQueueFromGallery, appendPaths, removeMissing, removePaths, loadModels, loadTaggingSettings,
    persistTaggingSettings, resolveRunTargets, startRun, stopRun,
    setupProgressListener, applyInferenceResults, retryFailed, setCurrentIndex, saveCurrent, saveAndNext,
    replacePaths, reloadCaptionsFromDisk, persistSession, restoreSession, consumeReturnContext, clearCompletedSession,
  }
})

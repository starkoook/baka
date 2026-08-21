import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'baka-tools-config'
const TOOL_POSTERS_KEY = 'baka-tools-tool-posters'

export type ToolPosterKey = 'gallery' | 'booruGallery' | 'tagger' | 'training' | 'upscale' | 'workbench' | 'video' | 'imageTools'
export type ToolPosters = Record<ToolPosterKey, string | null>

const DEFAULT_TOOL_POSTERS: ToolPosters = {
  gallery: null,
  booruGallery: null,
  tagger: null,
  training: null,
  upscale: null,
  workbench: null,
  video: null,
  imageTools: null,
}

function loadToolPosters(): ToolPosters {
  try {
    const raw = localStorage.getItem(TOOL_POSTERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ToolPosters>
      return { ...DEFAULT_TOOL_POSTERS, ...parsed }
    }
  } catch {}
  return { ...DEFAULT_TOOL_POSTERS }
}

function saveToolPosters(posters: ToolPosters) {
  try {
    localStorage.setItem(TOOL_POSTERS_KEY, JSON.stringify(posters))
  } catch {}
}

function loadConfig(): { theme: 'dark' | 'light'; showMascot: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { theme: 'dark', showMascot: true }
}

function saveConfig(config: Record<string, unknown>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {}
}

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme)
}

// Apply immediately before app mounts to prevent flash
const saved = loadConfig()
applyTheme(saved.theme)

export const useAppStore = defineStore('app', () => {
  const version = ref(typeof window !== 'undefined' && window.appAPI?.getVersion ? window.appAPI.getVersion() : '0.2.0')
  const status = ref('就绪')
  const lastError = ref('')
  const errorCount = ref(0)
  const theme = ref<'dark' | 'light'>(saved.theme)
  const showMascot = ref(saved.showMascot)
  const toolPickerOpen = ref(false)
  const toolPosters = ref<ToolPosters>(loadToolPosters())

  let _errorTimer: ReturnType<typeof setTimeout> | null = null

  function setStatus(text: string) { status.value = text }

  function setError(text: string) {
    lastError.value = text
    errorCount.value++
    status.value = '❌ ' + text
    if (_errorTimer) clearTimeout(_errorTimer)
    _errorTimer = setTimeout(() => clearError(), 8000)
  }

  function clearError() {
    if (_errorTimer) { clearTimeout(_errorTimer); _errorTimer = null }
    lastError.value = ''
    status.value = '就绪'
  }

  function clearErrorHistory() {
    clearError()
    errorCount.value = 0
  }

  function setTheme(t: 'dark' | 'light') {
    theme.value = t
    applyTheme(t)
    saveConfig({ theme: t, showMascot: showMascot.value })
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function toggleMascot() {
    showMascot.value = !showMascot.value
    saveConfig({ theme: theme.value, showMascot: showMascot.value })
  }

  function toggleToolPicker() {
    toolPickerOpen.value = !toolPickerOpen.value
  }

  function closeToolPicker() {
    toolPickerOpen.value = false
  }

  function setToolPoster(key: ToolPosterKey, path: string | null) {
    toolPosters.value = { ...toolPosters.value, [key]: path }
    saveToolPosters(toolPosters.value)
  }

  return {
    version,
    status,
    lastError,
    errorCount,
    theme,
    showMascot,
    toolPickerOpen,
    toolPosters,
    setStatus,
    setError,
    clearError,
    clearErrorHistory,
    setTheme,
    toggleTheme,
    toggleMascot,
    toggleToolPicker,
    closeToolPicker,
    setToolPoster,
  }
})

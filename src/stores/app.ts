import { defineStore } from 'pinia'
import { ref } from 'vue'
import { TOOL_CATALOG, type ToolKey } from '@/features/tools/tool-catalog'

const STORAGE_KEY = 'baka-tools-config'
const TOOL_POSTERS_KEY = 'baka-tools-tool-posters'
/** 界面改版后默认改为浅色；老配置里保存的深色只迁移一次，之后尊重用户选择。 */
const THEME_VERSION = 2

export type ToolPosterKey = ToolKey
export type ToolPosters = Record<ToolPosterKey, string | null>

const DEFAULT_TOOL_POSTERS: ToolPosters = Object.fromEntries(TOOL_CATALOG.map((tool) => [tool.key, null])) as ToolPosters

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

interface AppConfig {
  theme: 'dark' | 'light'
  showMascot: boolean
  themeVersion?: number
}

function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      const config: AppConfig = {
        theme: parsed.theme === 'dark' ? 'dark' : 'light',
        showMascot: parsed.showMascot !== false,
        themeVersion: parsed.themeVersion,
      }
      if ((config.themeVersion ?? 1) < THEME_VERSION) {
        config.theme = 'light'
        config.themeVersion = THEME_VERSION
        saveConfig(config)
      }
      return config
    }
  } catch {}
  return { theme: 'light', showMascot: true, themeVersion: THEME_VERSION }
}

function saveConfig(config: AppConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, themeVersion: THEME_VERSION }))
  } catch {}
}

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme)
}

// Apply immediately before app mounts to prevent flash
const saved = loadConfig()
applyTheme(saved.theme)

export const useAppStore = defineStore('app', () => {
  const version = ref('0.1.0')
  const status = ref('就绪')
  const lastError = ref('')
  const errorCount = ref(0)
  const theme = ref<'dark' | 'light'>(saved.theme)
  const showMascot = ref(saved.showMascot)
  const toolPickerOpen = ref(false)
  /** 每次打开时 +1，工具选择页据此把焦点放进搜索框 */
  const toolPickerFocusRequest = ref(0)
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

  function openToolPicker(options: { focusSearch?: boolean } = {}) {
    toolPickerOpen.value = true
    if (options.focusSearch) toolPickerFocusRequest.value++
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
    toolPickerFocusRequest,
    toolPosters,
    setStatus,
    setError,
    clearError,
    clearErrorHistory,
    setTheme,
    toggleTheme,
    toggleMascot,
    openToolPicker,
    toggleToolPicker,
    closeToolPicker,
    setToolPoster,
  }
})

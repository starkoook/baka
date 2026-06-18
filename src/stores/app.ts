import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'baka-tools-config'

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
  const version = ref('0.1.0')
  const status = ref('就绪')
  const theme = ref<'dark' | 'light'>(saved.theme)
  const showMascot = ref(saved.showMascot)

  function setStatus(text: string) { status.value = text }

  function setTheme(t: 'dark' | 'light') {
    theme.value = t
    applyTheme(t)
    saveConfig({ theme: t, showMascot: showMascot.value })
  }

  function toggleTheme() {
    // Trigger wipe animation
    document.documentElement.classList.add('theme-wiping')
    setTimeout(() => document.documentElement.classList.remove('theme-wiping'), 600)
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function toggleMascot() {
    showMascot.value = !showMascot.value
    saveConfig({ theme: theme.value, showMascot: showMascot.value })
  }

  return {
    version,
    status,
    theme,
    showMascot,
    setStatus,
    setTheme,
    toggleTheme,
    toggleMascot,
  }
})

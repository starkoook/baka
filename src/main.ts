import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { setupInteractions } from './composables/clickSound'
import { useAppStore } from './stores/app'
import { useLogStore } from './stores/logs'
import { toIpcPayload, toPlainLogEntry } from './lib/ipc-payload'
import { isBenignRendererError } from './lib/renderer-errors'
import './styles/global.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const logStore = useLogStore()

function persistLog(type: 'info' | 'error' | 'warn' | 'success', message: string, source = 'renderer') {
  if (window.logAPI?.append) {
    try { void window.logAPI.append(toIpcPayload({ type, message: String(message), source: String(source) })) } catch { logStore.add(type, message) }
    return
  }
  logStore.add(type, message)
}

function ingestRemote(entry: { time?: string; type?: string; message?: string }) {
  logStore.ingest(toPlainLogEntry(entry))
}

if (window.logAPI) {
  window.logAPI.onEntry((entry) => ingestRemote(entry))
  void window.logAPI.getHistory?.(500).then((res) => {
    if (res?.success && res.data?.entries) {
      for (const entry of res.data.entries) ingestRemote(entry)
    }
  }).catch(() => {})
}

app.config.errorHandler = (err, _instance, info) => {
  const msg = err instanceof Error ? err.message : String(err)
  if (isBenignRendererError(msg)) return
  const full = info ? msg + ' (' + info + ')' : msg
  console.error('[app]', full, err)
  try { useAppStore().setError(full) } catch { /* store not ready yet */ }
  persistLog('error', full, 'vue')
}

window.addEventListener('error', (e) => {
  const msg = e.message || e.error?.message || '未知脚本错误'
  if (isBenignRendererError(msg)) return
  console.error('[window]', msg, e)
  try { useAppStore().setError(msg) } catch { /* */ }
  persistLog('error', msg, 'window')
})

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || '未处理的 Promise 异常')
  if (isBenignRendererError(msg)) return
  console.error('[promise]', msg, e.reason)
  try { useAppStore().setError(msg) } catch { /* */ }
  persistLog('error', msg, 'promise')
})

app.mount('#app')

setupInteractions()

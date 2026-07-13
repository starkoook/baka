import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { setupInteractions } from './composables/clickSound'
import { useAppStore } from './stores/app'
import './styles/global.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// ── Global error capture → visible in status bar ──
app.config.errorHandler = (err, _instance, info) => {
  const msg = err instanceof Error ? err.message : String(err)
  const full = info ? `${msg} (${info})` : msg
  console.error('[app]', full, err)
  try {
    const store = useAppStore()
    store.setError(full)
  } catch { /* store not ready yet */ }
}

window.addEventListener('error', (e) => {
  const msg = e.message || e.error?.message || '未知脚本错误'
  console.error('[window]', msg, e)
  try { useAppStore().setError(msg) } catch { /* */ }
})

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || '未处理的 Promise 异常')
  console.error('[promise]', msg, e.reason)
  try { useAppStore().setError(msg) } catch { /* */ }
})

app.mount('#app')

// Global click sounds + hover effects
setupInteractions()

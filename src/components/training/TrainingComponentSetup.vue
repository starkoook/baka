<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{ ready: [] }>()
const loading = ref(true)
const installing = ref(false)
const paused = ref(false)
const error = ref('')
const state = ref<any>(null)
const recommendation = ref<any>(null)
const progress = ref({ componentId: '', downloaded: 0, total: 0, percent: 0, bytesPerSecond: 0 })
let removeProgress: (() => void) | undefined

const runtimeId = computed(() => recommendation.value?.preferred_runtime_id || '')
const runtimeAvailable = computed(() => !!runtimeId.value && !!state.value?.manifest?.components?.[`runtime-${runtimeId.value}`])
const downloadSize = computed(() => formatBytes(state.value?.downloadBytes || 0))
const progressLabel = computed(() => progress.value.componentId === 'trainer' ? '训练器核心' : '标准训练环境')

function formatBytes(bytes: number) {
  if (!bytes) return '检查后自动计算'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++ }
  return `${value.toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const api = window.trainingComponentsAPI
    if (!api) { emit('ready'); return }
    state.value = await api.inspect()
    recommendation.value = state.value?.recommendation || await api.recommendation()
    if (state.value?.ready) emit('ready')
  } catch (reason: any) {
    error.value = reason?.message || '无法检查训练组件'
  } finally {
    loading.value = false
  }
}

async function install() {
  if (!runtimeAvailable.value) { error.value = '当前组件源没有适合这台电脑的训练环境，可以稍后更换在线源或导入兼容缓存。'; return }
  installing.value = true
  paused.value = false
  error.value = ''
  try {
    await window.trainingComponentsAPI?.install(runtimeId.value)
    await refresh()
  } catch (reason: any) {
    error.value = reason?.message || '安装失败，请重试'
  } finally {
    installing.value = false
  }
}

async function pause() {
  await window.trainingComponentsAPI?.pause()
  paused.value = true
  installing.value = false
}

async function resume() {
  installing.value = true
  paused.value = false
  error.value = ''
  try {
    await window.trainingComponentsAPI?.resume(runtimeId.value)
    await refresh()
  } catch (reason: any) {
    error.value = reason?.message || '继续下载失败'
  } finally {
    installing.value = false
  }
}

async function cancel() {
  await window.trainingComponentsAPI?.cancel()
  installing.value = false
  paused.value = false
}

async function importCache() {
  const source = await window.fsAPI.selectFolder()
  if (!source) return
  error.value = ''
  try {
    await window.trainingComponentsAPI?.importCache({ source })
    await refresh()
  } catch (reason: any) {
    error.value = reason?.message || '组件缓存导入失败'
  }
}

onMounted(() => {
  removeProgress = window.trainingComponentsAPI?.onProgress(value => { progress.value = value })
  refresh()
})
onUnmounted(() => removeProgress?.())
</script>

<template>
  <main class="setup-shell">
    <section class="setup-card">
      <div class="setup-mark">LoRA</div>
      <p class="setup-kicker">首次使用准备</p>
      <h1>安装训练功能</h1>
      <p class="setup-copy">Baka 主程序保持轻量。只有你需要训练时，才下载训练器核心和适合这台电脑的独立环境。</p>

      <div v-if="loading" class="setup-status">正在检查本机训练组件…</div>
      <template v-else>
        <div class="setup-device">
          <div><span>检测结果</span><strong>{{ recommendation?.gpu_name || '显卡信息暂不可用' }}</strong></div>
          <div><span>推荐方案</span><strong>{{ runtimeId || '暂未匹配' }}</strong></div>
          <div><span>预计下载</span><strong>{{ downloadSize }}</strong></div>
        </div>
        <p class="setup-reason">{{ recommendation?.reason_zh }}</p>

        <div v-if="installing || paused" class="setup-progress">
          <div><span>{{ paused ? '已暂停' : `正在下载${progressLabel}` }}</span><strong>{{ Math.round(progress.percent || 0) }}%</strong></div>
          <div class="setup-track"><i :style="{ width: `${progress.percent || 0}%` }"></i></div>
          <small>{{ formatBytes(progress.downloaded) }} / {{ formatBytes(progress.total) }} · {{ formatBytes(progress.bytesPerSecond) }}/s</small>
        </div>

        <div v-if="error" class="setup-error">{{ error }}</div>
        <div class="setup-actions">
          <button v-if="!installing && !paused" class="primary" :disabled="!runtimeAvailable" @click="install">{{ runtimeAvailable ? '下载并安装' : '当前源暂无兼容环境' }}</button>
          <button v-if="installing" class="secondary" @click="pause">暂停</button>
          <button v-if="paused" class="primary" @click="resume">继续</button>
          <button v-if="installing || paused" class="quiet" @click="cancel">取消</button>
          <button v-if="error && !installing" class="secondary" @click="refresh">重新检查</button>
          <button v-if="!installing" class="quiet" @click="importCache">导入已有组件缓存</button>
        </div>
        <p class="setup-note">支持断点续传和 SHA-256 校验；安装失败不会覆盖当前可用版本。</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.setup-shell{min-height:calc(100vh - 120px);display:grid;place-items:center;padding:32px}.setup-card{width:min(620px,100%);padding:36px;border:1px solid var(--border-color);border-radius:20px;background:linear-gradient(145deg,var(--bg-elevated),var(--bg-primary));box-shadow:0 24px 70px rgba(0,0,0,.2)}.setup-mark{display:grid;place-items:center;width:58px;height:58px;border-radius:17px;background:var(--accent-primary);color:#fff;font-weight:800;letter-spacing:-1px}.setup-kicker{margin:22px 0 4px;color:var(--accent-primary);font-size:12px;font-weight:700;letter-spacing:.12em}.setup-card h1{margin:0;color:var(--text-primary);font-size:28px}.setup-copy{max-width:520px;margin:10px 0 24px;color:var(--text-secondary);font-size:14px;line-height:1.7}.setup-status{padding:28px;border:1px dashed var(--border-color);border-radius:14px;color:var(--text-tertiary);text-align:center}.setup-device{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.setup-device div{padding:14px;border:1px solid var(--border-color);border-radius:12px;background:var(--hud-bg)}.setup-device span,.setup-device strong{display:block}.setup-device span{margin-bottom:5px;color:var(--text-tertiary);font-size:11px}.setup-device strong{color:var(--text-primary);font-size:13px}.setup-reason{margin:12px 0 18px;color:var(--text-tertiary);font-size:12px}.setup-progress{margin:14px 0;padding:15px;border-radius:13px;background:var(--accent-bg)}.setup-progress>div:first-child{display:flex;justify-content:space-between;color:var(--text-primary);font-size:13px}.setup-track{height:7px;margin:10px 0 7px;overflow:hidden;border-radius:10px;background:rgba(127,127,127,.2)}.setup-track i{display:block;height:100%;border-radius:inherit;background:var(--accent-primary);transition:width .2s}.setup-progress small{color:var(--text-tertiary)}.setup-error{margin:12px 0;padding:11px 13px;border:1px solid rgba(239,68,68,.25);border-radius:10px;background:rgba(239,68,68,.08);color:#ef7777;font-size:12px}.setup-actions{display:flex;gap:9px;flex-wrap:wrap}.setup-actions button{padding:10px 18px;border-radius:10px;border:1px solid transparent;cursor:pointer;font-weight:650}.primary{background:var(--accent-primary);color:white}.secondary{border-color:var(--border-color)!important;background:var(--bg-elevated);color:var(--text-primary)}.quiet{background:transparent;color:var(--text-tertiary)}.setup-note{margin:14px 0 0;color:var(--text-tertiary);font-size:11px}@media(max-width:650px){.setup-device{grid-template-columns:1fr}.setup-card{padding:24px}}
</style>

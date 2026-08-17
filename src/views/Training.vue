<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePipelineStore } from '@/stores/pipeline'

// ── Types ──
interface RuntimeStatus {
  id: string; name_zh: string; name_en: string; desc_zh: string; desc_en: string
  category: string; experimental: boolean
  env_vars: Record<string, string>
  status: string; statusText: string
  pythonPath: string | null; envDir: string | null
}
interface SystemInfo {
  python: { path: string; version: string } | null; git: boolean
  cuda: { available: boolean; gpus: Array<{ name: string; vramTotal: number; driver: string }>; cudaVersion: string | null }
}
interface LogEntry { type: string; message: string; runtimeId?: string; time?: string }

// ── State ──
const repoPath = ref(''); const hasRepo = ref(false)
const runtimes = ref<RuntimeStatus[]>([]); const activeRuntime = ref('')
const systemInfo = ref<SystemInfo | null>(null)
const runtimeRecommendation = ref<{ preferred_runtime_id: string | null; reason_zh?: string } | null>(null)
const logs = ref<LogEntry[]>([])
const guiRunning = ref(false); const guiUrl = ref('')
const installing = ref<Set<string>>(new Set())
const cloning = ref(false); const cloneCancelled = ref(false)
const consoleOpen = ref(false)
const onboardingDismissed = ref(false)
const pipeline = usePipelineStore()
let removeRuntimeLogListener: (() => void) | undefined
let removeRuntimeStatusListener: (() => void) | undefined

// ── GPU 推荐 ──
const recommendedRuntime = computed(() => {
  if (runtimeRecommendation.value?.preferred_runtime_id) return runtimeRecommendation.value.preferred_runtime_id
  if (!systemInfo.value?.cuda?.available) return null
  const gpus = systemInfo.value.cuda.gpus
  if (!gpus.length) return null
  const gpuName = gpus[0].name.toLowerCase()
  if (/rtx\s*5\d{3}/i.test(gpuName) || /50[7-9]0/i.test(gpuName)) return 'blackwell'
  if (/rtx\s*[2-4]\d{3}/i.test(gpuName)) return 'sageattention2'
  if (/geforce|nvidia|gtx|quadro|tesla/i.test(gpuName)) return 'standard'
  if (/radeon|amd/i.test(gpuName)) return 'rocm-amd'
  if (/intel|arc|iris/i.test(gpuName)) return 'intel-xpu'
  return 'standard'
})
const recommendedObj = computed(() => runtimes.value.find(r => r.id === recommendedRuntime.value))

const activeObj = computed(() => runtimes.value.find(r => r.id === activeRuntime.value))
const installedCount = computed(() => runtimes.value.filter(r => r.status === 'installed').length)
const missingCount = computed(() => runtimes.value.filter(r => r.status === 'missing').length)
const activeInstalled = computed(() => activeObj.value?.status === 'installed')
const showOnboarding = computed(() => !hasRepo.value && !onboardingDismissed.value)

// 分类
const catOrder = ['nvidia', 'nvidia_frontier', 'intel', 'amd']
const catLabel = (c: string) => ({ nvidia: 'NVIDIA', nvidia_frontier: 'NVIDIA 前沿', intel: 'Intel', amd: 'AMD' }[c] || c)
const categories = computed(() => {
  const map: Record<string, RuntimeStatus[]> = {}
  for (const r of runtimes.value) {
    if (!map[r.category]) map[r.category] = []
    map[r.category].push(r)
  }
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => {
      const o: Record<string, number> = { installed: 0, initialized: 1, partial: 2, broken: 3, missing: 4 }
      return (o[a.status] ?? 5) - (o[b.status] ?? 5)
    })
  }
  return map
})

// ── Helpers ──
const dotIcon = (s: string) => ({ installed: '●', initialized: '◌', partial: '◎', broken: '⊗', missing: '○' }[s] || '○')
const dotColor = (s: string) => ({ installed: '#22c55e', initialized: '#f59e0b', partial: '#f59e0b', broken: '#ef4444', missing: '#555' }[s] || '#555')
const statusBadge = (s: string) => ({ installed: '已安装', initialized: '已初始化', partial: '部分', broken: '损坏', missing: '未安装' }[s] || s)
const badgeStyle = (s: string) => {
  const map: Record<string, string> = {
    installed: 'background:#22c55e18;color:#22c55e;border:1px solid #22c55e33',
    initialized: 'background:#f59e0b18;color:#f59e0b;border:1px solid #f59e0b33',
    partial: 'background:#f59e0b18;color:#f59e0b;border:1px solid #f59e0b33',
    broken: 'background:#ef444418;color:#ef4444;border:1px solid #ef444433',
    missing: 'background:transparent;color:#666;border:1px solid #333',
  }
  return map[s] || map.missing
}
const now = () => new Date().toLocaleTimeString()
const gpuShort = (s: string) => s.replace(/NVIDIA\s+/i, '').replace(/GeForce\s+/i, '').slice(0, 32)
const addLog = (msg: string, type = 'info', rid?: string) => logs.value.push({ time: now(), type, message: msg, runtimeId: rid })

// ── Lifecycle ──
onMounted(async () => {
  await scanAll()
  removeRuntimeLogListener = window.runtimeAPI?.onLog((entry: LogEntry) => {
    logs.value.push(entry)
    setTimeout(() => { const el = document.querySelector('.tr2-console-body'); if (el) el.scrollTop = el.scrollHeight }, 50)
  })
  removeRuntimeStatusListener = window.runtimeAPI?.onStatusChange((st: any) => {
    guiRunning.value = st.running
    if (!st.running) { pipeline.finishTask(); guiUrl.value = '' }
  })
  const gs = await window.runtimeAPI?.guiStatus()
  if (gs) guiRunning.value = gs.running
})
onUnmounted(() => {
  removeRuntimeLogListener?.()
  removeRuntimeStatusListener?.()
})

// ── Scan ──
async function scanAll() {
  const r = await window.runtimeAPI?.scan()
  if (r) { repoPath.value = r.repoPath; hasRepo.value = r.hasRepo; runtimes.value = r.runtimes }
  const i = await window.runtimeAPI?.systemInfo()
  if (i) systemInfo.value = i
  runtimeRecommendation.value = await window.runtimeAPI?.recommendation() || null
  // Auto-select best runtime
  if (recommendedRuntime.value && !activeRuntime.value) activeRuntime.value = recommendedRuntime.value
  else if (!activeRuntime.value && runtimes.value.length) activeRuntime.value = 'standard'
}

// ── Repo management ──
async function selectRepo() {
  const f = await window.fsAPI?.selectFolder()
  if (!f) return
  await window.runtimeAPI?.setRepoPath(f)
  repoPath.value = f; hasRepo.value = true
  await scanAll()
}
async function doAutoClone() {
  if (cloning.value) return
  cloning.value = true; cloneCancelled.value = false
  addLog('正在从 GitHub 下载训练器...', 'info')
  try {
    const r = await window.runtimeAPI?.autoClone()
    if (r?.success) {
      if (r.path) repoPath.value = r.path
      hasRepo.value = true
      if (r.message === '训练器已存在，跳过克隆') addLog('训练器目录已存在，跳过下载', 'info')
      await scanAll()
    } else {
      addLog(`下载失败: ${r?.error || '未知错误'}`, 'error')
    }
  } catch (e: any) { addLog(`下载异常: ${e.message}`, 'error') }
  finally { cloning.value = false }
}
async function cancelClone() {
  cloneCancelled.value = true
  // Note: autoClone uses execSync for git, cannot truly cancel mid-operation
  addLog('取消请求已发出（当前操作完成后生效）', 'warn')
}

// ── Runtime install / cancel ──
async function doInstall(id: string) {
  if (installing.value.has(id)) return
  installing.value = new Set([...installing.value, id])
  addLog(`开始安装 ${id}...`, 'info', id)
  try {
    const r = await window.runtimeAPI?.install(id)
    if (r?.success) { addLog(`${id} 安装完成 ✓`, 'info', id); await scanAll() }
    else if (r?.cancelled) { addLog(`${id} 安装已停止`, 'warn', id); await scanAll() }
    else if (r?.method === 'script') addLog(`${id} 需要手动运行安装脚本: ${r.script}`, 'info', id)
    else addLog(`${id} 安装失败: ${r?.error || '未知错误'}`, 'error', id)
  } catch (e: any) { addLog(`${id} 安装异常: ${e.message}`, 'error', id) }
  finally { installing.value = new Set([...installing.value].filter(x => x !== id)) }
}
async function doCancelInstall() {
  const r = await window.runtimeAPI?.cancelInstall()
  if (r?.success) addLog('正在取消安装，等待当前进程退出…', 'warn', r.runtimeId)
  else addLog(r?.error || '没有正在进行的安装', 'warn')
}

// ── Launch / Stop ──
async function doLaunch() {
  const id = activeRuntime.value
  addLog(`启动 ${id}...`, 'info', id)
  pipeline.startTask(`训练 GUI: ${activeObj.value?.name_zh || id}`)
  try {
    const r = await window.runtimeAPI?.launch({ runtimeId: id, port: 28000 })
    if (r?.success) {
      guiRunning.value = true; guiUrl.value = r.url || 'http://127.0.0.1:28000'
      addLog(`${id} 已启动: ${guiUrl.value}`, 'info', id)
      pipeline.updateProgress(50, '后端就绪', '运行中')
    } else { addLog(`${id} 启动失败: ${r?.error}`, 'error', id); pipeline.finishTask() }
  } catch (e: any) { addLog(`启动异常: ${e.message}`, 'error', id); pipeline.finishTask() }
}
async function doStop() {
  addLog('停止 GUI...', 'info')
  try {
    await window.runtimeAPI?.stop()
    guiRunning.value = false; guiUrl.value = ''
    pipeline.finishTask(); addLog('已停止', 'info')
  } catch (e: any) { addLog(`停止异常: ${e.message}`, 'error'); pipeline.finishTask() }
}

// ── Tools ──
function openGUI() { if (guiUrl.value) window.open(guiUrl.value, '_blank') }
function openTB() { window.open('http://127.0.0.1:6006', '_blank') }
function openTagEdit() { window.open('http://127.0.0.1:28001', '_blank') }
function clearLogs() { logs.value = [] }
function openPath() { if (repoPath.value) window.shellAPI?.openFolder(repoPath.value) }
</script>

<template>
  <div class="tr2-root">

    <!-- ═══════════ HERO BAR ═══════════ -->
    <div class="tr2-hero">
      <div class="tr2-hero-left">
        <div class="tr2-hero-badge" :class="{ on: guiRunning }">
          <span class="tr2-dot" :class="{ pulse: guiRunning }" :style="{ background: guiRunning ? '#22c55e' : '#555' }"></span>
          {{ guiRunning ? '运行中' : '未启动' }}
        </div>
        <div>
          <h1>LoRA 训练运行时</h1>
          <p v-if="hasRepo" class="tr2-path">
            <code @click="openPath" title="点击打开目录" style="cursor:pointer">{{ repoPath }}</code>
          </p>
          <p v-else class="tr2-path" style="color:#f59e0b">尚未获取训练器</p>
        </div>
      </div>
      <div class="tr2-hero-right">
        <button v-if="!guiRunning" class="tr2-btn tr2-btn-launch" :disabled="!activeInstalled" @click="doLaunch">
          ▶ 启动
        </button>
        <template v-else>
          <button class="tr2-btn tr2-btn-outline" @click="openGUI">🌐 打开界面</button>
          <button class="tr2-btn tr2-btn-outline" @click="openTB" title="TensorBoard">📊 TB</button>
          <button class="tr2-btn tr2-btn-outline" @click="openTagEdit" title="标签编辑器">🏷 标签器</button>
          <button class="tr2-btn tr2-btn-stop" @click="doStop">■ 停止</button>
        </template>
      </div>
    </div>

    <!-- ═══════════ ONBOARDING ═══════════ -->
    <div v-if="showOnboarding" class="tr2-onboard">
      <div class="tr2-onboard-card">
        <div class="tr2-onboard-icon">🚀</div>
        <h2>欢迎使用训练运行时</h2>
        <p>开始训练之前，需要先获取训练器代码并安装运行环境</p>

        <!-- GPU -->
        <div v-if="systemInfo?.cuda?.available && systemInfo.cuda.gpus.length" class="tr2-onboard-gpu">
          <span class="tr2-onboard-gpu-label">检测到显卡</span>
          <span class="tr2-onboard-gpu-name">{{ gpuShort(systemInfo.cuda.gpus[0].name) }}</span>
          <span v-if="systemInfo.cuda.gpus[0].vramTotal" class="tr2-onboard-gpu-vram">
            {{ (systemInfo.cuda.gpus[0].vramTotal / 1024).toFixed(1) }} GB · CUDA {{ systemInfo.cuda.cudaVersion || '' }}
          </span>
        </div>
        <div v-else class="tr2-onboard-gpu warn">
          <span class="tr2-onboard-gpu-label">⚠ 未检测到 NVIDIA CUDA GPU</span>
          <span class="tr2-onboard-gpu-vram">训练器主要支持 NVIDIA 显卡</span>
        </div>

        <!-- Actions -->
        <div class="tr2-onboard-actions">
          <button class="tr2-btn tr2-btn-onboard-pri" :disabled="cloning" @click="doAutoClone">
            <span v-if="cloning" class="tr2-spin"></span>
            {{ cloning ? '下载中...' : '📥 一键下载训练器' }}
          </button>
          <button v-if="cloning" class="tr2-btn tr2-btn-cancel" @click="cancelClone">取消</button>
          <button v-else class="tr2-btn tr2-btn-onboard-sec" @click="selectRepo">📂 选择已有目录</button>
        </div>

        <!-- Steps -->
        <div class="tr2-onboard-steps">
          <div class="tr2-onboard-step done"><span>{{ hasRepo ? '✓' : '1' }}</span><label>获取训练器</label></div>
          <div class="tr2-onboard-arrow">→</div>
          <div class="tr2-onboard-step" :class="{ done: installedCount > 0 }">
            <span>{{ installedCount > 0 ? '✓' : '2' }}</span><label>安装运行时</label>
          </div>
          <div class="tr2-onboard-arrow">→</div>
          <div class="tr2-onboard-step"><span>3</span><label>启动训练</label></div>
        </div>

        <button class="tr2-onboard-dismiss" @click="onboardingDismissed = true">跳过引导 →</button>
      </div>
    </div>

    <!-- ═══════════ GPU RECOMMENDATION ═══════════ -->
    <div v-if="hasRepo && recommendedObj && recommendedObj.status !== 'installed'" class="tr2-recommend">
      <div class="tr2-rec-left">
        💡 根据你的 GPU，推荐使用 <strong>{{ recommendedObj.name_zh }}</strong>
        <span class="tr2-rec-desc">{{ recommendedObj.desc_zh }}</span>
      </div>
      <button class="tr2-btn tr2-btn-rec" :disabled="installing.has(recommendedObj.id)" @click="doInstall(recommendedObj.id)">
        {{ installing.has(recommendedObj.id) ? '安装中...' : '安装推荐运行时' }}
      </button>
    </div>

    <!-- ═══════════ RUNTIME GRID ═══════════ -->
    <div v-if="hasRepo" class="tr2-body">
      <!-- Runtime cards -->
      <div v-for="cat in catOrder" :key="cat">
        <div v-if="categories[cat]" class="tr2-cat">
          <h3>{{ catLabel(cat) }} <span class="tr2-cat-count">{{ categories[cat].filter(r => r.status === 'installed').length }}/{{ categories[cat].length }}</span></h3>
          <div class="tr2-grid">
            <div
              v-for="rt in categories[cat]" :key="rt.id"
              class="tr2-card"
              :class="{ active: activeRuntime === rt.id, installed: rt.status === 'installed', recommended: recommendedRuntime === rt.id }"
              @click="activeRuntime = rt.id"
            >
              <!-- Status dot -->
              <div class="tr2-card-top">
                <span class="tr2-card-dot" :style="{ color: dotColor(rt.status) }">{{ dotIcon(rt.status) }}</span>
                <span v-if="recommendedRuntime === rt.id" class="tr2-card-tag rec">推荐</span>
                <span v-if="rt.experimental" class="tr2-card-tag exp">实验</span>
              </div>

              <!-- Name + desc -->
              <div class="tr2-card-name">{{ rt.name_zh }}</div>
              <div class="tr2-card-desc">{{ rt.desc_zh }}</div>

              <!-- Status badge -->
              <div class="tr2-card-badge" :style="badgeStyle(rt.status)">{{ statusBadge(rt.status) }}</div>

              <!-- Action button -->
              <div v-if="rt.status !== 'installed'" class="tr2-card-actions">
                <button
                  class="tr2-btn tr2-btn-install-sm"
                  :class="{ spinning: installing.has(rt.id) }"
                  :disabled="installing.has(rt.id)"
                  @click.stop="doInstall(rt.id)"
                >
                  {{ installing.has(rt.id) ? '安装中...' : '安装' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel install bar (shows when anything is installing) -->
      <div v-if="installing.size > 0" class="tr2-installing-bar">
        <span class="tr2-spin"></span>
        正在安装: {{ [...installing].join(', ') }}
        <button class="tr2-btn tr2-btn-cancel" @click="doCancelInstall">取消安装</button>
      </div>

      <!-- Control bar (bottom) -->
      <div class="tr2-ctrl">
        <div class="tr2-ctrl-left">
          <select v-model="activeRuntime" class="tr2-select">
            <option v-for="rt in runtimes" :key="rt.id" :value="rt.id" :disabled="rt.status === 'missing' && !rt.experimental">
              {{ rt.name_zh }}{{ rt.status === 'installed' ? ' ✓' : '' }}
            </option>
          </select>
          <button class="tr2-btn tr2-btn-sm" :disabled="cloning" @click="selectRepo">📂 切换目录</button>
          <button class="tr2-btn tr2-btn-sm" @click="scanAll">🔄 刷新</button>
          <button class="tr2-btn tr2-btn-sm" @click="consoleOpen = !consoleOpen">{{ consoleOpen ? '▲' : '▼' }} 控制台</button>
        </div>
        <div class="tr2-ctrl-right">
          <span>运行环境 {{ installedCount }}/{{ runtimes.length }}</span>
        </div>
      </div>

      <!-- Console -->
      <div v-if="consoleOpen" class="tr2-console">
        <div class="tr2-console-header">
          <span>控制台输出</span>
          <button class="tr2-btn tr2-btn-sm" @click="clearLogs">清空</button>
        </div>
        <div class="tr2-console-body">
          <div v-if="!logs.length" class="tr2-console-empty">等待操作...</div>
          <div v-for="(l, i) in logs" :key="i" class="tr2-console-line" :class="'tr2-log-' + l.type">
            <span class="tr2-log-time">{{ l.time }}</span>
            <span v-if="l.runtimeId" class="tr2-log-rid">[{{ l.runtimeId }}]</span>
            {{ l.message }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════
   Training Runtime v2 — Launcher-style
   ══════════════════════════════════════ */
.tr2-root { max-width: 1100px; margin: 0 auto; padding: 20px 28px 40px; color: #e0e0e0; user-select: none; }

/* ── HERO ── */
.tr2-hero { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.tr2-hero-left { display: flex; align-items: center; gap: 14px; }
.tr2-hero-badge { display: flex; align-items: center; gap: 7px; font-size: .7rem; font-weight: 700; color: #666; padding: 6px 14px; border-radius: 20px; border: 1px solid #2a2a4a; background: #12122a; }
.tr2-hero-badge.on { color: #22c55e; border-color: #22c55e33; background: #22c55e08; }
.tr2-dot { width: 7px; height: 7px; border-radius: 50%; }
.tr2-dot.pulse { animation: dotPulse 2s infinite; }
@keyframes dotPulse { 0%,100% { box-shadow: 0 0 0 0 #22c55e66; } 50% { box-shadow: 0 0 0 6px transparent; } }
.tr2-hero-left h1 { font-size: 1.3rem; font-weight: 700; margin: 0; color: #f0f0f0; }
.tr2-hero-left p { margin: 2px 0 0; font-size: .72rem; }
.tr2-path code { font-family: monospace; font-size: .72rem; color: #6b8cff; background: #1a1a2e; padding: 2px 8px; border-radius: 4px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
.tr2-hero-right { display: flex; gap: 8px; }

/* ── BUTTONS ── */
.tr2-btn { padding: 7px 16px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; font-size: .8rem; font-weight: 500; transition: all .15s; background: transparent; color: #ccc; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.tr2-btn:disabled { opacity: .35; cursor: not-allowed; }
.tr2-btn-launch { background: #6b8cff; color: #fff; font-weight: 700; padding: 9px 24px; font-size: .85rem; border-radius: 10px; }
.tr2-btn-launch:hover:not(:disabled) { background: #5577ee; }
.tr2-btn-stop { background: #ef4444; color: #fff; font-weight: 700; padding: 9px 20px; border-radius: 10px; }
.tr2-btn-stop:hover:not(:disabled) { background: #dc2626; }
.tr2-btn-outline { border-color: #333; }
.tr2-btn-outline:hover:not(:disabled) { border-color: #666; color: #fff; }
.tr2-btn-sm { padding: 4px 12px; font-size: .75rem; }
.tr2-btn-rec { background: #f59e0b; color: #111; font-weight: 600; }
.tr2-btn-rec:hover:not(:disabled) { background: #e5900a; }
.tr2-btn-install-sm { background: #6b8cff; color: #fff; padding: 5px 14px; font-size: .72rem; border-radius: 6px; }
.tr2-btn-install-sm:hover:not(:disabled) { background: #5577ee; }
.tr2-btn-cancel { color: #ef4444; border-color: #ef444433; font-size: .75rem; }
.tr2-btn-cancel:hover:not(:disabled) { background: #ef444411; }

.tr2-spin { display: inline-block; width: 13px; height: 13px; border: 2px solid #ffffff44; border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── ONBOARDING ── */
.tr2-onboard { display: flex; justify-content: center; margin-bottom: 24px; }
.tr2-onboard-card { max-width: 500px; width: 100%; background: #12122a; border: 1px solid #2a2a4a; border-radius: 16px; padding: 32px; text-align: center; }
.tr2-onboard-icon { font-size: 48px; margin-bottom: 8px; }
.tr2-onboard-card h2 { font-size: 1.2rem; font-weight: 700; color: #f0f0f0; margin: 0 0 4px; }
.tr2-onboard-card > p { font-size: .8rem; color: #888; margin: 0 0 18px; }
.tr2-onboard-gpu { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 10px; padding: 12px 16px; text-align: left; margin-bottom: 18px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tr2-onboard-gpu.warn { border-color: #f59e0b33; background: #f59e0b08; }
.tr2-onboard-gpu-label { font-size: .68rem; color: #888; font-weight: 600; text-transform: uppercase; }
.tr2-onboard-gpu-name { font-size: .85rem; color: #f0f0f0; font-weight: 600; }
.tr2-onboard-gpu-vram { font-size: .75rem; color: #aaa; }
.tr2-onboard-actions { display: flex; gap: 10px; margin-bottom: 22px; justify-content: center; }
.tr2-btn-onboard-pri { background: #6b8cff; color: #fff; padding: 12px 24px; border-radius: 10px; font-size: .85rem; font-weight: 600; }
.tr2-btn-onboard-pri:hover:not(:disabled) { background: #5577ee; }
.tr2-btn-onboard-sec { border-color: #333; background: #1a1a2e; padding: 12px 24px; border-radius: 10px; font-size: .85rem; }
.tr2-btn-onboard-sec:hover:not(:disabled) { border-color: #666; color: #fff; }
.tr2-onboard-steps { display: flex; align-items: center; justify-content: center; gap: 10px; border-top: 1px solid #2a2a4a; padding-top: 16px; }
.tr2-onboard-step { display: flex; flex-direction: column; align-items: center; gap: 4px; opacity: .4; }
.tr2-onboard-step.done { opacity: 1; }
.tr2-onboard-step span { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #555; display: flex; align-items: center; justify-content: center; font-size: .72rem; font-weight: 700; color: #888; }
.tr2-onboard-step.done span { border-color: #22c55e; color: #22c55e; background: #22c55e11; }
.tr2-onboard-step label { font-size: .68rem; color: #888; }
.tr2-onboard-step.done label { color: #22c55e; }
.tr2-onboard-arrow { color: #444; font-size: 1rem; }
.tr2-onboard-dismiss { background: none; border: none; color: #555; cursor: pointer; font-size: .72rem; margin-top: 14px; }
.tr2-onboard-dismiss:hover { color: #888; }

/* ── RECOMMEND ── */
.tr2-recommend { background: #f59e0b0a; border: 1px solid #f59e0b22; border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.tr2-rec-left { font-size: .82rem; color: #e0c06c; display: flex; flex-direction: column; gap: 2px; }
.tr2-rec-left strong { color: #f59e0b; }
.tr2-rec-desc { font-size: .72rem; color: #997a3a; }

/* ── BODY ── */
.tr2-body { }

/* ── CATEGORY ── */
.tr2-cat { margin-bottom: 8px; }
.tr2-cat h3 { font-size: .72rem; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
.tr2-cat h3::after { content: ''; flex: 1; height: 1px; background: #2a2a4a; }
.tr2-cat-count { font-size: .7rem; color: #444; font-weight: 400; }

/* ── GRID ── */
.tr2-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 16px; }

/* ── CARD ── */
.tr2-card { background: #12122a; border: 1px solid #2a2a4a; border-radius: 12px; padding: 16px; cursor: pointer; transition: all .15s; display: flex; flex-direction: column; gap: 6px; position: relative; }
.tr2-card:hover { border-color: #444; }
.tr2-card.active { border-color: #6b8cff !important; box-shadow: 0 0 0 1px #6b8cff33, 0 4px 16px #6b8cff11; background: #6b8cff08; }
.tr2-card.active::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: #6b8cff; }
.tr2-card.installed { border-color: #22c55e22; }
.tr2-card.recommended { border-color: #f59e0b33; }

.tr2-card-top { display: flex; align-items: center; gap: 6px; }
.tr2-card-dot { font-size: .75rem; }
.tr2-card-tag { font-size: .6rem; font-weight: 700; padding: 1px 7px; border-radius: 8px; letter-spacing: .3px; }
.tr2-card-tag.rec { background: #f59e0b18; color: #f59e0b; border: 1px solid #f59e0b33; }
.tr2-card-tag.exp { background: #6b8cff18; color: #6b8cff; border: 1px solid #6b8cff33; }

.tr2-card-name { font-size: .85rem; font-weight: 700; color: #f0f0f0; }
.tr2-card-desc { font-size: .72rem; color: #888; line-height: 1.4; min-height: 2em; }
.tr2-card-badge { font-size: .62rem; font-weight: 600; padding: 2px 8px; border-radius: 8px; align-self: flex-start; }
.tr2-card-actions { margin-top: auto; padding-top: 6px; }

/* ── INSTALLING BAR ── */
.tr2-installing-bar { background: #6b8cff0a; border: 1px solid #6b8cff22; border-radius: 10px; padding: 10px 16px; display: flex; align-items: center; gap: 10px; font-size: .78rem; color: #6b8cff; margin-top: 8px; }

/* ── CONTROL BAR ── */
.tr2-ctrl { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-top: 1px solid #2a2a4a; margin-top: 12px; }
.tr2-ctrl-left { display: flex; align-items: center; gap: 8px; }
.tr2-select { padding: 6px 12px; background: #1a1a2e; color: #ccc; border: 1px solid #2a2a4a; border-radius: 6px; font-size: .78rem; cursor: pointer; }
.tr2-select:focus { outline: none; border-color: #6b8cff; }
.tr2-ctrl-right { font-size: .75rem; color: #666; }

/* ── CONSOLE ── */
.tr2-console { background: #0a0a18; border: 1px solid #2a2a4a; border-radius: 10px; margin-top: 10px; overflow: hidden; }
.tr2-console-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; font-size: .72rem; color: #666; border-bottom: 1px solid #1a1a2e; }
.tr2-console-body { padding: 10px 14px; max-height: 200px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: .72rem; line-height: 1.7; }
.tr2-console-body::-webkit-scrollbar { width: 4px; }
.tr2-console-body::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
.tr2-console-empty { color: #444; padding: 20px 0; text-align: center; }
.tr2-console-line { color: #999; }
.tr2-log-error { color: #ef4444; }
.tr2-log-warn { color: #f59e0b; }
.tr2-log-time { color: #444; margin-right: 6px; font-size: .65rem; }
.tr2-log-rid { color: #6b8cff; margin-right: 4px; }
</style>

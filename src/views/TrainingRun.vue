<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parseTrainingProgress } from '@/features/training/training-progress'
import TrainingToolsPanel from '@/components/training/TrainingToolsPanel.vue'

const router = useRouter()
const route = useRoute()

// ── State ──
const guiUrl = ref('http://127.0.0.1:28000')
const guiRunning = ref(false)
const taskId = ref('')
const tasks = ref<any[]>([])
const taskOutput = ref<string[]>([])
const systemStats = ref<any>(null)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const outputPollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const activeTab = ref<'webui' | 'monitor' | 'tasks' | 'tensorboard' | 'tools'>('webui')
const taskTotalLines = ref(0)
let removeStatusListener: (() => void) | undefined
let removeLogListener: (() => void) | undefined

// ── Computed ──
const runningTasks = computed(() => tasks.value.filter((t: any) => t.status === 'RUNNING' || t.status === 'STARTING'))
const finishedTasks = computed(() => tasks.value.filter((t: any) => t.status === 'FINISHED' || t.status === 'TERMINATED'))
const currentProgress = computed(() => parseTrainingProgress(taskOutput.value))
const embeddedPath = computed(() => {
  if (activeTab.value === 'tensorboard') return '/tensorboard.html'
  return '/'
})

// ── Tab switching ──
function switchTab(tab: 'webui' | 'monitor' | 'tasks' | 'tensorboard' | 'tools') {
  activeTab.value = tab
  if (tab === 'monitor' && pollTimer.value) {
    fetchStats()
  } else if (tab === 'tasks') {
    fetchTasks()
  }
}

// ── Status check ──
async function checkStatus() {
  try {
    const gs = await window.runtimeAPI?.guiStatus()
    if (gs) {
      guiRunning.value = gs.running
      if (gs.url) guiUrl.value = gs.url
    }
  } catch {}
}

// ── Task polling ──
async function fetchTasks() {
  try {
    const res = await window.trainingHttpAPI?.getTasks()
    if (res?.ok && res.data?.data?.tasks) {
      tasks.value = res.data.data.tasks
    }
  } catch {}
}

async function fetchTaskOutput(tid: string) {
  if (!tid) return
  try {
    const res = await window.trainingHttpAPI?.getTaskOutput(tid, 100)
    if (res?.ok && res.data?.data) {
      taskOutput.value = res.data.data.lines || []
      taskTotalLines.value = res.data.data.total || 0
    }
  } catch {}
}

async function stopCurrentTask() {
  if (!taskId.value) return
  try {
    const res = await window.trainingHttpAPI?.stopTask(taskId.value)
    if (res?.ok) {
      taskOutput.value.push('[系统] 已发送停止信号')
    }
  } catch {}
}

// ── System monitoring ──
async function fetchStats() {
  try {
    const res = await window.trainingHttpAPI?.systemMonitor()
    if (res?.ok && res.data?.data) {
      systemStats.value = res.data.data
    }
  } catch {}
}

// ── Launch / Stop GUI ──
function launchGUI() {
  window.open(guiUrl.value + embeddedPath.value, '_blank')
}

function getLastConfig() {
  try {
    const schema = localStorage.getItem('baka-training-last-schema') || 'lora-master'
    return JSON.parse(localStorage.getItem(`baka-training-draft:${schema}`) || '{}')?.draft || null
  } catch { return null }
}

function copyLastConfig() {
  const config = getLastConfig()
  if (config) navigator.clipboard.writeText(JSON.stringify(config, null, 2))
}

function openLastOutput() {
  const output = getLastConfig()?.output_dir
  if (output) window.shellAPI.openFolder(output)
}

function returnToConfig() {
  localStorage.setItem('baka-training-mode', 'advanced')
  router.push('/training')
}

async function doLaunchGUI() {
  const result = await window.runtimeAPI?.launch({ runtimeId: '', port: 28000 })
  if (result?.success && result.url) {
    guiUrl.value = result.url
    guiRunning.value = true
  }
}

async function doStopGUI() {
  await window.runtimeAPI?.stop()
  guiRunning.value = false
}

// ── Lifecycle ──
onMounted(async () => {
  await checkStatus()

  const tid = typeof route.query.taskId === 'string' ? route.query.taskId : ''
  if (tid) taskId.value = tid

  // 任务轮询
  if (taskId.value) {
    outputPollTimer.value = setInterval(() => fetchTaskOutput(taskId.value), 2000)
  }
  pollTimer.value = setInterval(() => {
    fetchTasks()
    if (activeTab.value === 'monitor') fetchStats()
  }, 3000)

  // 监听运行时状态变化
  removeStatusListener = window.runtimeAPI?.onStatusChange((st: any) => {
    guiRunning.value = st.running
  })

  // 监听后端日志
  removeLogListener = window.runtimeAPI?.onLog((entry: any) => {
    if (taskId.value) {
      taskOutput.value.push(`[${entry.runtimeId || 'runtime'}] ${entry.message}`)
    }
  })
})

onUnmounted(() => {
  if (pollTimer.value) { clearInterval(pollTimer.value); pollTimer.value = null }
  if (outputPollTimer.value) { clearInterval(outputPollTimer.value); outputPollTimer.value = null }
  removeStatusListener?.()
  removeLogListener?.()
})

// ── Format helpers ──
function vramBarPercent() {
  if (!systemStats.value?.gpu?.available) return 0
  const gpu = systemStats.value.gpu.gpus?.[0]
  if (!gpu || !gpu.total_mb) return 0
  return Math.round(gpu.used_mb / gpu.total_mb * 100)
}

function memoryPercent() {
  if (!systemStats.value?.ram?.percent) return 0
  return Math.round(systemStats.value.ram.percent)
}
</script>

<template>
  <div class="trun-root">
    <!-- ═══ HEADER ═══ -->
    <div class="trun-hero">
      <div class="trun-hero-left">
        <h1>训练运行时</h1>
        <div class="trun-hero-meta">
          <span class="trun-dot" :class="{ on: guiRunning }"></span>
          <span class="trun-url">{{ guiUrl }}</span>
          <router-link to="/training" class="trun-link">← 返回配置</router-link>
          <router-link to="/training/runtime" class="trun-link">运行时管理</router-link>
        </div>
      </div>
      <div class="trun-hero-right">
        <button class="btn btn-sm btn-outline" @click="launchGUI" :disabled="!guiRunning">
          在浏览器中打开
        </button>
        <button class="btn btn-sm" :class="guiRunning ? 'btn-danger' : 'btn-primary'" @click="guiRunning ? doStopGUI() : doLaunchGUI()">
          {{ guiRunning ? '停止' : '启动' }}后端
        </button>
      </div>
    </div>

    <!-- ═══ TAB BAR ═══ -->
    <div class="trun-tabs">
      <button :class="{ active: activeTab === 'webui' }" @click="switchTab('webui')">训练界面</button>
      <button :class="{ active: activeTab === 'monitor' }" @click="switchTab('monitor')">
        系统监控
        <span v-if="systemStats?.gpu?.gpus?.[0]" class="trun-tab-badge">
          GPU {{ ((systemStats.gpu.gpus[0].used_mb || 0) / 1024).toFixed(1) }}G
        </span>
      </button>
      <button :class="{ active: activeTab === 'tasks' }" @click="switchTab('tasks')">
        任务状态
        <span v-if="runningTasks.length" class="trun-tab-badge on">{{ runningTasks.length }}</span>
      </button>
      <button :class="{ active: activeTab === 'tensorboard' }" @click="switchTab('tensorboard')">TensorBoard</button>
      <button :class="{ active: activeTab === 'tools' }" @click="switchTab('tools')">训练工具</button>
    </div>

    <!-- ═══ PANELS ═══ -->

    <!-- 训练界面 (webview) -->
    <div v-if="activeTab === 'webui'" class="trun-panel trun-webview-panel">
      <div v-if="!guiRunning" class="trun-placeholder">
        <p>训练后端未启动</p>
        <button class="btn btn-primary" @click="doLaunchGUI">启动训练后端</button>
      </div>
      <webview
        v-else
        :src="guiUrl + '/'"
        class="trun-webview"
        :preload="''"
        allowpopups
      ></webview>
    </div>

    <div v-if="activeTab === 'tensorboard'" class="trun-panel trun-webview-panel">
      <div v-if="!guiRunning" class="trun-placeholder"><p>训练后端未启动</p><button class="btn btn-primary" @click="doLaunchGUI">启动训练后端</button></div>
      <webview v-else :src="guiUrl + embeddedPath" class="trun-webview" :preload="''" allowpopups></webview>
    </div>

    <TrainingToolsPanel v-if="activeTab === 'tools' && guiRunning" />
    <div v-else-if="activeTab === 'tools'" class="trun-placeholder"><p>训练后端未启动</p><button class="btn btn-primary" @click="doLaunchGUI">启动训练后端</button></div>

    <!-- 系统监控 -->
    <div v-if="activeTab === 'monitor'" class="trun-panel trun-monitor-panel">
      <!-- GPU -->
      <div class="trun-mon-section" v-if="systemStats?.gpu?.available">
        <h3>GPU</h3>
        <div v-for="gpu in systemStats.gpu.gpus" :key="gpu.index" class="trun-mon-card">
          <div class="trun-mon-label">{{ gpu.name }}</div>
          <div class="trun-mon-bar-wrap">
            <div class="trun-mon-bar">
              <div class="trun-mon-bar-fill" :style="{ width: gpu.utilization_pct + '%' }"></div>
            </div>
            <span class="trun-mon-val">{{ gpu.utilization_pct }}%</span>
          </div>
          <div class="trun-mon-bar-wrap">
            <div class="trun-mon-bar">
              <div class="trun-mon-bar-fill vram" :style="{ width: (gpu.total_mb > 0 ? Math.round(gpu.used_mb / gpu.total_mb * 100) : 0) + '%' }"></div>
            </div>
            <span class="trun-mon-val">{{ (gpu.used_mb / 1024).toFixed(1) }} / {{ (gpu.total_mb / 1024).toFixed(1) }} GB</span>
          </div>
          <div class="trun-mon-meta">
            <span v-if="gpu.temperature_c">🌡 {{ gpu.temperature_c }}°C</span>
            <span v-if="gpu.power_draw_w">⚡ {{ gpu.power_draw_w }}W</span>
          </div>
        </div>
      </div>

      <!-- RAM -->
      <div class="trun-mon-section" v-if="systemStats?.ram">
        <h3>内存</h3>
        <div class="trun-mon-card">
          <div class="trun-mon-bar-wrap">
            <div class="trun-mon-bar">
              <div class="trun-mon-bar-fill ram" :style="{ width: memoryPercent() + '%' }"></div>
            </div>
            <span class="trun-mon-val">{{ systemStats.ram.percent }}%</span>
          </div>
          <div class="trun-mon-val">
            {{ (systemStats.ram.used_mb / 1024).toFixed(1) }} / {{ (systemStats.ram.total_mb / 1024).toFixed(1) }} GB
          </div>
        </div>
      </div>

      <!-- CPU -->
      <div class="trun-mon-section" v-if="systemStats?.cpu">
        <h3>CPU</h3>
        <div class="trun-mon-card">
          <div class="trun-mon-bar-wrap">
            <div class="trun-mon-bar">
              <div class="trun-mon-bar-fill cpu" :style="{ width: systemStats.cpu.percent + '%' }"></div>
            </div>
            <span class="trun-mon-val">{{ systemStats.cpu.percent }}%</span>
          </div>
        </div>
      </div>

      <div v-if="!systemStats" class="trun-placeholder">
        <p>监控数据加载中...</p>
      </div>
    </div>

    <!-- 任务状态 -->
    <div v-if="activeTab === 'tasks'" class="trun-panel trun-tasks-panel">
      <!-- 按钮栏 -->
      <div class="trun-tasks-actions">
        <button class="btn btn-sm btn-outline" @click="fetchTasks">🔄 刷新</button>
        <button v-if="taskId" class="btn btn-sm btn-danger" @click="stopCurrentTask">⏹ 停止训练</button>
        <button class="btn btn-sm btn-outline" @click="returnToConfig">再次训练 / 继续训练</button>
        <button class="btn btn-sm btn-outline" @click="copyLastConfig">复制配置</button>
        <button class="btn btn-sm btn-outline" @click="openLastOutput">打开输出目录</button>
      </div>

      <div v-if="taskId" class="trun-progress-card">
        <div><strong>{{ currentProgress.percent }}%</strong><span v-if="currentProgress.epoch">Epoch {{ currentProgress.epoch }}/{{ currentProgress.totalEpochs }}</span><span v-if="currentProgress.step">Step {{ currentProgress.step }}/{{ currentProgress.totalSteps }}</span><span v-if="currentProgress.loss !== null">Loss {{ currentProgress.loss }}</span><span v-if="currentProgress.speed">{{ currentProgress.speed }}</span><span v-if="currentProgress.eta">剩余 {{ currentProgress.eta }}</span></div>
        <div class="trun-progress-track"><i :style="{ width: currentProgress.percent + '%' }"></i></div>
      </div>

      <!-- 任务列表 -->
      <div v-if="tasks.length === 0" class="trun-placeholder">
        <p>暂无任务记录</p>
      </div>
      <div v-for="task in tasks" :key="task.id" class="trun-task-card" :class="{ running: task.status === 'RUNNING', finished: task.status === 'FINISHED' }">
        <div class="trun-task-header">
          <span class="trun-task-id">{{ task.id.slice(0, 8) }}...</span>
          <span class="trun-task-status" :class="task.status.toLowerCase()">{{ task.status }}</span>
          <span v-if="task.returncode !== null && task.returncode !== undefined" class="trun-task-code">
            exit: {{ task.returncode }}
          </span>
        </div>
      </div>

      <!-- 任务输出日志 -->
      <div v-if="taskId && taskOutput.length" class="trun-output">
        <div class="trun-output-header">训练输出 ({{ taskTotalLines }} 行)</div>
        <div class="trun-output-body" ref="outputBody">
          <div v-for="(line, i) in taskOutput" :key="i" class="trun-output-line">{{ line }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trun-root { padding: 24px 32px; color: #e0e0e0; min-height: 100vh; }

/* ── Header ── */
.trun-hero { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.trun-hero-left h1 { font-size: 1.5rem; font-weight: 700; color: #f0f0f0; margin: 0 0 6px 0; }
.trun-hero-meta { font-size: .78rem; color: #888; display: flex; align-items: center; gap: 8px; }
.trun-dot { width: 8px; height: 8px; border-radius: 50%; background: #555; flex-shrink: 0; }
.trun-dot.on { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
.trun-url { font-family: monospace; color: #6b8cff; }
.trun-link { color: #6b8cff; text-decoration: none; font-size: .78rem; }
.trun-link:hover { color: #88aaff; }
.trun-hero-right { display: flex; gap: 8px; }

/* ── Tabs ── */
.trun-tabs { display: flex; gap: 2px; margin-bottom: 16px; border-bottom: 1px solid #2a2a4a; padding-bottom: 0; }
.trun-tabs button { background: none; border: none; color: #888; padding: 8px 16px; cursor: pointer; font-size: .85rem; border-bottom: 2px solid transparent; transition: all .15s; display: flex; align-items: center; gap: 6px; }
.trun-tabs button:hover { color: #ccc; }
.trun-tabs button.active { color: #6b8cff; border-bottom-color: #6b8cff; }
.trun-tab-badge { font-size: .7rem; background: #333; padding: 1px 6px; border-radius: 8px; color: #888; }
.trun-tab-badge.on { background: #22c55e22; color: #22c55e; }

/* ── Panels ── */
.trun-panel { }
.trun-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; color: #666; gap: 12px; }

/* ── Webview ── */
.trun-webview-panel { height: calc(100vh - 170px); }
.trun-webview { width: 100%; height: 100%; border: 1px solid #2a2a4a; border-radius: 8px; background: #1a1a2e; }

/* ── Monitor ── */
.trun-monitor-panel { display: flex; flex-direction: column; gap: 16px; }
.trun-mon-section h3 { font-size: .9rem; color: #aaa; margin: 0 0 8px 0; }
.trun-mon-card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px; padding: 12px 16px; }
.trun-mon-label { font-size: .82rem; color: #ccc; margin-bottom: 8px; }
.trun-mon-bar-wrap { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.trun-mon-bar { flex: 1; height: 8px; background: #2a2a4a; border-radius: 4px; overflow: hidden; }
.trun-mon-bar-fill { height: 100%; background: #6b8cff; border-radius: 4px; transition: width .5s; }
.trun-mon-bar-fill.vram { background: #22c55e; }
.trun-mon-bar-fill.ram { background: #f59e0b; }
.trun-mon-bar-fill.cpu { background: #ec4899; }
.trun-mon-val { font-size: .78rem; color: #aaa; font-family: monospace; min-width: 80px; text-align: right; white-space: nowrap; }
.trun-mon-meta { display: flex; gap: 16px; font-size: .75rem; color: #777; margin-top: 6px; }

/* ── Tasks ── */
.trun-tasks-panel { }
.trun-tasks-actions { display: flex; gap: 8px; margin-bottom: 12px; }
.trun-progress-card { display: grid; gap: 8px; margin-bottom: 12px; padding: 12px 14px; border: 1px solid #2a2a4a; border-radius: 8px; background: #1a1a2e; }.trun-progress-card>div:first-child { display: flex; align-items: center; gap: 14px; color: #888; font-size: .75rem; }.trun-progress-card strong { color: #6b8cff; font-size: 1rem; }.trun-progress-track { height: 7px; overflow: hidden; border-radius: 5px; background: #2a2a4a; }.trun-progress-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#6b8cff,#a855f7); transition: width .4s; }
.trun-task-card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 8px; padding: 10px 14px; margin-bottom: 6px; }
.trun-task-card.running { border-color: #22c55e44; }
.trun-task-card.finished { opacity: .6; }
.trun-task-header { display: flex; align-items: center; gap: 12px; font-size: .82rem; }
.trun-task-id { font-family: monospace; color: #6b8cff; }
.trun-task-status { padding: 1px 8px; border-radius: 4px; font-size: .72rem; font-weight: 600; }
.trun-task-status.running { background: #22c55e22; color: #22c55e; }
.trun-task-status.starting { background: #f59e0b22; color: #f59e0b; }
.trun-task-status.finished { background: #8882; color: #888; }
.trun-task-status.terminated { background: #ef444422; color: #ef4444; }
.trun-task-code { font-family: monospace; color: #888; font-size: .72rem; }

/* ── Output ── */
.trun-output { margin-top: 16px; background: #0d0d1a; border: 1px solid #2a2a4a; border-radius: 8px; overflow: hidden; }
.trun-output-header { font-size: .78rem; color: #888; padding: 6px 12px; border-bottom: 1px solid #2a2a4a; background: #111122; }
.trun-output-body { max-height: 400px; overflow-y: auto; padding: 8px 12px; font-family: 'Consolas', 'Cascadia Code', monospace; font-size: .78rem; line-height: 1.5; }
.trun-output-line { color: #aaa; white-space: pre-wrap; word-break: break-all; }
.trun-output-line[data-type="error"] { color: #ef4444; }

/* ── Buttons (inline, no external CSS) ── */
.btn { padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: .82rem; font-weight: 500; transition: all .15s; }
.btn-primary { background: #6b8cff; color: #fff; }
.btn-primary:hover { background: #5577ee; }
.btn-danger { background: #ef4444; color: #fff; }
.btn-danger:hover { background: #dc2626; }
.btn-outline { background: transparent; border: 1px solid #444; color: #ccc; }
.btn-outline:hover { border-color: #888; color: #fff; }
.btn-sm { padding: 4px 12px; font-size: .78rem; }
.btn:disabled { opacity: .4; cursor: not-allowed; }
</style>

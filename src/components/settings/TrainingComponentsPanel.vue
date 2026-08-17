<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const loading = ref(true)
const busy = ref('')
const message = ref('')
const error = ref('')
const state = ref<any>({ installed: {}, previous: {}, versions: {} })
const runtimeId = computed(() => state.value?.recommendation?.preferred_runtime_id || 'standard')
const installedItems = computed(() => Object.entries(state.value?.installed || {}) as Array<[string, any]>)

function label(id: string) {
  return id === 'trainer' ? '训练器核心' : id === 'runtime-standard' ? '标准训练环境' : id
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    state.value = await window.trainingComponentsAPI?.inspect() || state.value
  } catch (reason: any) {
    error.value = reason?.message || '读取组件状态失败'
  } finally {
    loading.value = false
  }
}

async function run(name: string, action: () => Promise<any>, success: string) {
  busy.value = name
  error.value = ''
  message.value = ''
  try {
    await action()
    message.value = success
    await refresh()
  } catch (reason: any) {
    error.value = reason?.message || '操作失败'
  } finally {
    busy.value = ''
  }
}

function repair() {
  return run('repair', () => window.trainingComponentsAPI!.repair(runtimeId.value), '训练组件已修复')
}

function rollback(componentId: string) {
  return run(`rollback:${componentId}`, () => window.trainingComponentsAPI!.rollback(componentId), `${label(componentId)}已回退`)
}

function clearCache() {
  return run('clear', () => window.trainingComponentsAPI!.clearCache(), '下载缓存已清理，已安装组件不会受影响')
}

async function exportCache() {
  const destination = await window.fsAPI.selectFolder()
  if (!destination) return
  await run('export', () => window.trainingComponentsAPI!.exportCache({
    destination,
    componentIds: installedItems.value.map(([id]) => id),
  }), '组件缓存已导出')
}

async function importCache() {
  const source = await window.fsAPI.selectFolder()
  if (!source) return
  await run('import', () => window.trainingComponentsAPI!.importCache({ source }), '组件缓存已导入，下次安装时无需重新下载')
}

onMounted(refresh)
</script>

<template>
  <div class="component-panel">
    <header>
      <div><p>TRAINING COMPONENTS</p><h2>训练组件</h2></div>
      <button class="ghost" :disabled="loading" @click="refresh">刷新</button>
    </header>
    <p class="intro">主程序和训练环境分开更新。这里的操作不会删除你的模型、数据集和训练结果。</p>

    <div v-if="loading" class="empty">正在读取组件状态…</div>
    <template v-else>
      <div class="version-strip">
        <span><small>Baka</small>{{ state.versions?.baka || '—' }}</span>
        <span><small>训练器</small>{{ state.versions?.trainer || '未安装' }}</span>
        <span><small>Schema</small>{{ state.versions?.schema || '未安装' }}</span>
        <span><small>环境</small>{{ state.versions?.runtime || '未安装' }}</span>
      </div>

      <div v-if="installedItems.length" class="component-list">
        <article v-for="[id, item] in installedItems" :key="id">
          <div class="status-dot"></div>
          <div class="component-copy"><strong>{{ label(id) }}</strong><span>{{ item.version }}</span><small>{{ item.path }}</small></div>
          <button v-if="state.previous?.[id]" class="ghost" :disabled="!!busy" @click="rollback(id)">
            {{ busy === `rollback:${id}` ? '回退中…' : `回退到 ${state.previous[id].version}` }}
          </button>
        </article>
      </div>
      <div v-else class="empty">训练组件尚未安装。进入 LoRA 训练页时会出现安装向导。</div>

      <div class="actions">
        <button class="primary" :disabled="!!busy || !installedItems.length" @click="repair">{{ busy === 'repair' ? '修复中…' : '检查并修复' }}</button>
        <button class="ghost" :disabled="!!busy" @click="clearCache">清理下载缓存</button>
        <button class="ghost" :disabled="!!busy || !installedItems.length" @click="exportCache">导出组件缓存</button>
        <button class="ghost" :disabled="!!busy" @click="importCache">导入组件缓存</button>
      </div>
      <p v-if="message" class="message ok">{{ message }}</p>
      <p v-if="error" class="message bad">{{ error }}</p>
      <p class="hint">训练运行期间会自动锁定修复、回退和清理操作，防止任务被中途破坏。</p>
    </template>
  </div>
</template>

<style scoped>
.component-panel{padding:22px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-elevated)}header{display:flex;align-items:center;justify-content:space-between}header p{margin:0 0 3px;color:var(--accent-primary);font-size:10px;font-weight:700;letter-spacing:.12em}h2{margin:0;color:var(--text-primary);font-size:17px}.intro{margin:9px 0 18px;color:var(--text-tertiary);font-size:12px;line-height:1.6}.version-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.version-strip span{padding:11px;border:1px solid var(--border-color);border-radius:10px;color:var(--text-primary);font-size:12px}.version-strip small{display:block;margin-bottom:4px;color:var(--text-tertiary);font-size:10px}.component-list{display:grid;gap:8px}.component-list article{display:flex;align-items:center;gap:10px;padding:13px;border:1px solid var(--border-color);border-radius:11px;background:var(--hud-bg)}.status-dot{width:8px;height:8px;border-radius:50%;background:#32c274;box-shadow:0 0 0 4px rgba(50,194,116,.1)}.component-copy{min-width:0;display:flex;flex:1;flex-direction:column}.component-copy strong{color:var(--text-primary);font-size:13px}.component-copy span{color:var(--accent-primary);font-size:11px}.component-copy small{overflow:hidden;color:var(--text-tertiary);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.actions button,header button,.component-list button{padding:8px 12px;border-radius:9px;cursor:pointer;font-size:12px}.primary{border:1px solid var(--accent-primary);background:var(--accent-primary);color:#fff}.ghost{border:1px solid var(--border-color);background:transparent;color:var(--text-secondary)}button:disabled{opacity:.4;cursor:not-allowed}.empty{padding:28px;border:1px dashed var(--border-color);border-radius:11px;color:var(--text-tertiary);font-size:12px;text-align:center}.message{margin:12px 0 0;padding:9px 11px;border-radius:8px;font-size:11px}.ok{background:rgba(50,194,116,.08);color:#54cf8b}.bad{background:rgba(239,68,68,.08);color:#ef7777}.hint{margin:12px 0 0;color:var(--text-tertiary);font-size:10px}@media(max-width:650px){.version-strip{grid-template-columns:repeat(2,1fr)}}
</style>

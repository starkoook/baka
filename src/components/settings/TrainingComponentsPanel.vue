<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SettingsCard from './SettingsCard.vue'
import SettingsRow from './SettingsRow.vue'

const loading = ref(true)
const busy = ref('')
const message = ref('')
const error = ref('')
const state = ref<any>({ installed: {}, previous: {}, versions: {} })
const runtimeId = computed(() => state.value?.recommendation?.preferred_runtime_id || 'standard')
const installedItems = computed(() => Object.entries(state.value?.installed || {}) as Array<[string, any]>)

function label(id: string) {
  return id === 'trainer' ? '训练器组件' : id === 'runtime-standard' ? '标准训练运行' : id
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    state.value = await window.trainingComponentsAPI?.inspect() || state.value
  } catch (reason: any) {
    error.value = reason?.message || '获取组件状态失败'
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
  return run(`rollback:${componentId}`, () => window.trainingComponentsAPI!.rollback(componentId), `${label(componentId)}已回滚`)
}

function clearCache() {
  return run('clear', () => window.trainingComponentsAPI!.clearCache(), '下载缓存已清理，已安装组件不受影响')
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
  await run('import', () => window.trainingComponentsAPI!.importCache({ source }), '组件缓存已导入，下次安装时会优先复用')
}

onMounted(refresh)
</script>

<template>
  <div class="component-panel">
    <SettingsCard title="训练组件" description="管理本地训练器与运行时。不会删除模型、数据集或训练任务。">
      <SettingsRow title="状态" description="刷新已安装组件与版本">
        <button class="sk-btn" :disabled="loading" type="button" @click="refresh">刷新</button>
      </SettingsRow>
      <SettingsRow title="Baka" :description="state.versions?.baka || '—'" />
      <SettingsRow title="训练器" :description="state.versions?.trainer || '未安装'" />
      <SettingsRow title="Schema" :description="state.versions?.schema || '未安装'" />
      <SettingsRow title="运行时" :description="state.versions?.runtime || '未安装'" />
    </SettingsCard>

    <SettingsCard v-if="!loading" title="已安装" description="可以回滚到上一个可用版本">
      <SettingsRow
        v-for="[id, item] in installedItems"
        :key="id"
        :title="label(id)"
        :description="item.path"
        align="start"
      >
        <span class="sk-ver">{{ item.version }}</span>
        <button
          v-if="state.previous?.[id]"
          class="sk-btn"
          type="button"
          :disabled="!!busy"
          @click="rollback(id)"
        >{{ busy === `rollback:${id}` ? '回滚中…' : `回滚到 ${state.previous[id].version}` }}</button>
      </SettingsRow>
      <div v-if="!installedItems.length" class="sk-empty">训练组件尚未安装。进入 LoRA 训练页时会走安装向导。</div>
    </SettingsCard>
    <div v-else class="sk-empty">正在读取组件状态…</div>

    <SettingsCard title="维护" description="修复与缓存导出导入不会中断正在跑的任务">
      <SettingsRow title="检查并修复" description="校验当前运行时并尝试修复">
        <button class="sk-btn sk-btn--primary" type="button" :disabled="!!busy || !installedItems.length" @click="repair">{{ busy === 'repair' ? '修复中…' : '检查并修复' }}</button>
      </SettingsRow>
      <SettingsRow title="下载缓存" description="清理缓存不会卸载已安装组件">
        <button class="sk-btn" type="button" :disabled="!!busy" @click="clearCache">清理缓存</button>
      </SettingsRow>
      <SettingsRow title="缓存包" description="导出或导入组件缓存目录">
        <button class="sk-btn" type="button" :disabled="!!busy || !installedItems.length" @click="exportCache">导出</button>
        <button class="sk-btn" type="button" :disabled="!!busy" @click="importCache">导入</button>
      </SettingsRow>
      <p v-if="message" class="sk-msg sk-msg--ok">{{ message }}</p>
      <p v-if="error" class="sk-msg sk-msg--bad">{{ error }}</p>
    </SettingsCard>
  </div>
</template>

<style scoped>
.component-panel { display: flex; flex-direction: column; gap: 14px; }
.sk-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.sk-btn:hover { border-color: var(--border-accent); color: var(--settings-accent); }
.sk-btn--primary { border-color: transparent; background: var(--settings-accent); color: var(--brand-on-primary); font-weight: 650; }
.sk-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sk-ver { font-size: 11px; color: var(--settings-accent); font-family: var(--font-mono); }
.sk-empty { padding: 14px var(--settings-row-pad-x); color: var(--settings-muted); font-size: 12px; }
.sk-msg { margin: 0; padding: 10px var(--settings-row-pad-x) 12px; font-size: 11px; }
.sk-msg--ok { color: var(--accent-success); }
.sk-msg--bad { color: var(--accent-danger); }
</style>

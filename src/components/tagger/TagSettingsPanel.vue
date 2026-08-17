<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  models: ModelInfo[]
  modelValue: string
  threshold: number
  tagSource: 'local' | 'llm' | 'combined'
  providers: string[]
}>()

const emit = defineEmits<{
  close: []
  'update:modelValue': [value: string]
  'update:threshold': [value: number]
  'update:tagSource': [value: 'local' | 'llm' | 'combined']
  refresh: []
}>()

const showAdvanced = ref(false)
const downloadableModels = ref<{ id: string; name: string; repo: string; installed: boolean }[]>([])
const downloading = ref<{ id: string; received: number; total: number } | null>(null)
const downloadError = ref('')
const activeModel = computed(() => props.models.find((model) => model.path === props.modelValue) ?? null)

async function importModel() {
  const paths = await window.fsAPI.selectModels()
  if (!paths?.length) return
  for (const path of paths) await window.taggerV2API.importModel(path)
  emit('refresh')
}

async function openModelDirectory() {
  await window.taggerV2API.openModelDir()
}

async function loadDownloadableModels() {
  if (!window.taggerV2API) return
  const response = await window.taggerV2API.listDownloadableModels()
  if (response.success && response.data) downloadableModels.value = response.data
}

async function downloadModel(model: { id: string }) {
  if (!window.taggerV2API || downloading.value) return
  downloadError.value = ''
  downloading.value = { id: model.id, received: 0, total: 0 }
  const response = await window.taggerV2API.downloadModel(model.id)
  downloading.value = null
  if (!response.success) {
    downloadError.value = response.error || '下载失败'
    return
  }
  await loadDownloadableModels()
  emit('refresh')
}

watch(() => props.visible, (visible) => {
  if (visible) void loadDownloadableModels()
}, { immediate: true })

onMounted(() => {
  window.taggerV2API?.onDownloadProgress((event) => {
    if (downloading.value?.id === event.modelId) {
      downloading.value = { ...downloading.value, received: event.received, total: event.total }
    }
  })
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-backdrop" @click.self="emit('close')">
      <section class="settings-panel">
        <header><div><p>MODEL SETTINGS</p><h2>标注设置</h2></div><button aria-label="关闭" @click="emit('close')">×</button></header>
        <div class="settings-scroll">
          <div class="source-tabs">
            <button class="active" @click="emit('update:tagSource', 'local')"><strong>本地 WD14</strong><span>当前可用</span></button>
            <button disabled title="云端视觉模型将在后续接入"><strong>云端视觉</strong><span>暂未接入</span></button>
            <button disabled title="组合模式将在云端接口接入后开放"><strong>组合模式</strong><span>暂未接入</span></button>
          </div>

          <div class="setting-heading"><span>本地模型</span><div><button @click="openModelDirectory">打开目录</button><button @click="importModel">导入模型</button></div></div>
          <div v-if="models.length" class="model-list">
            <button v-for="model in models" :key="model.path" :class="{ active: modelValue === model.path }" @click="emit('update:modelValue', model.path)">
              <span><strong>{{ model.name }}</strong><small>{{ model.resolution }}px · {{ model.provider || 'ONNX' }}</small></span><i>{{ modelValue === model.path ? '✓' : '' }}</i>
            </button>
          </div>
          <div v-else class="model-empty"><strong>没有找到 WD14 模型</strong><span>导入 `.onnx` 和对应的 `.csv` 后刷新。</span><button @click="importModel">导入模型</button></div>

          <div class="setting-heading"><span>在线下载模型</span></div>
          <div class="download-list">
            <div v-for="model in downloadableModels" :key="model.id" class="download-item">
              <span><strong>{{ model.name }}</strong><small>{{ model.installed ? '已安装' : '未安装' }}</small></span>
              <button :disabled="model.installed || !!downloading" @click="downloadModel(model)">
                {{ downloading?.id === model.id ? (downloading.total ? `${Math.round(downloading.received / downloading.total * 100)}%` : '下载中…') : (model.installed ? '已安装' : '下载') }}
              </button>
            </div>
          </div>
          <p v-if="downloadError" class="download-error">{{ downloadError }}</p>

          <label class="range-setting"><span>通用标签阈值 <strong>{{ threshold.toFixed(2) }}</strong></span><input type="range" min="0.05" max="0.95" step="0.01" :value="threshold" @input="emit('update:threshold', Number(($event.target as HTMLInputElement).value))" /><small>数值越高，标签越少但更可靠。</small></label>

          <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">{{ showAdvanced ? '收起' : '展开' }}高级信息</button>
          <dl v-if="showAdvanced && activeModel">
            <div><dt>输入布局</dt><dd>{{ activeModel.inputLayout || '自动' }}</dd></div><div><dt>归一化</dt><dd>{{ activeModel.normalization || '模型默认' }}</dd></div><div><dt>输出激活</dt><dd>{{ activeModel.outputActivation || '自动' }}</dd></div><div><dt>运行设备</dt><dd>{{ providers.join(' / ') || 'CPU' }}</dd></div>
          </dl>
        </div>
        <footer><button @click="emit('close')">完成</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-backdrop { position: fixed; inset: 0; z-index: 650; display: flex; justify-content: flex-end; background: rgba(7,6,9,.56); backdrop-filter: blur(6px); }.settings-panel { width: min(430px, 92vw); height: 100%; display: flex; flex-direction: column; border-left: 1px solid rgba(255,255,255,.1); background: #19171d; box-shadow: -24px 0 70px rgba(0,0,0,.36); }.settings-panel header { height: 66px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid rgba(255,255,255,.06); }.settings-panel header p { margin: 0 0 3px; color: var(--accent-primary); font-size: 7px; font-weight: 750; letter-spacing: .17em; }.settings-panel h2 { margin: 0; font-size: 17px; }.settings-panel header > button { width: 31px; height: 31px; border: 1px solid rgba(255,255,255,.07); border-radius: 8px; background: rgba(255,255,255,.025); color: var(--text-tertiary); cursor: pointer; font-size: 17px; }.settings-scroll { flex: 1; overflow: auto; padding: 18px; }.source-tabs { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }.source-tabs button { min-height: 55px; display: grid; gap: 3px; padding: 9px; border: 1px solid rgba(255,255,255,.06); border-radius: 9px; background: rgba(255,255,255,.02); color: var(--text-tertiary); text-align: left; cursor: pointer; }.source-tabs button.active { border-color: rgba(var(--accent-primary-rgb),.35); background: rgba(var(--accent-primary-rgb),.075); }.source-tabs button:disabled { opacity: .38; cursor: not-allowed; }.source-tabs strong { color: var(--text-secondary); font-size: 9px; }.source-tabs span { font-size: 7px; }.setting-heading { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 8px; color: var(--text-tertiary); font-size: 8px; font-weight: 650; }.setting-heading div { display: flex; gap: 4px; }.setting-heading button { border: 0; background: transparent; color: var(--accent-primary); cursor: pointer; font-size: 7px; }.model-list { display: grid; gap: 6px; }.model-list > button { display: flex; align-items: center; justify-content: space-between; padding: 11px; border: 1px solid rgba(255,255,255,.06); border-radius: 9px; background: rgba(255,255,255,.02); color: var(--text-tertiary); cursor: pointer; text-align: left; }.model-list > button.active { border-color: rgba(var(--accent-primary-rgb),.35); background: rgba(var(--accent-primary-rgb),.07); }.model-list span { display: grid; gap: 4px; }.model-list strong { color: var(--text-secondary); font-size: 10px; }.model-list small { font-size: 7px; }.model-list i { color: var(--accent-primary); font-style: normal; }.model-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 24px; border: 1px dashed rgba(255,255,255,.08); border-radius: 9px; color: var(--text-tertiary); text-align: center; }.model-empty strong { color: var(--text-secondary); font-size: 11px; }.model-empty span { font-size: 8px; }.model-empty button { margin-top: 5px; border: 0; background: transparent; color: var(--accent-primary); cursor: pointer; }.range-setting { display: grid; gap: 9px; margin-top: 22px; }.range-setting > span { display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 9px; }.range-setting strong { color: var(--accent-primary); font-family: ui-monospace, monospace; }.range-setting input { width: 100%; accent-color: var(--accent-primary); }.range-setting small { color: var(--text-tertiary); font-size: 7px; }.advanced-toggle { width: 100%; height: 32px; margin-top: 18px; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; background: transparent; color: var(--text-tertiary); cursor: pointer; font-size: 8px; }dl { overflow: hidden; margin: 8px 0 0; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; }dl div { display: flex; justify-content: space-between; padding: 8px 9px; border-bottom: 1px solid rgba(255,255,255,.045); font-size: 8px; }dl div:last-child { border: 0; }dt { color: var(--text-tertiary); }dd { margin: 0; color: var(--text-secondary); }.settings-panel footer { flex: none; padding: 12px 18px; border-top: 1px solid rgba(255,255,255,.06); }.settings-panel footer button { width: 100%; height: 36px; border: 0; border-radius: 8px; background: var(--accent-primary); color: white; cursor: pointer; font-weight: 700; }
.download-list { display: grid; gap: 6px; }.download-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 10px; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; background: rgba(255,255,255,.02); }.download-item span { display: grid; gap: 3px; }.download-item strong { color: var(--text-secondary); font-size: 9px; }.download-item small { color: var(--text-tertiary); font-size: 7px; }.download-item button { height: 28px; padding: 0 9px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(255,255,255,.03); color: var(--accent-primary); cursor: pointer; font-size: 8px; }.download-item button:disabled { opacity: .45; cursor: not-allowed; color: var(--text-tertiary); }.download-error { margin: 8px 0 0; color: #ff9a86; font-size: 8px; }
</style>

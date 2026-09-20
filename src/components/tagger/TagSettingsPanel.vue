<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type DownloadableModel = { id: string; name: string; repo: string; installed: boolean }

const props = defineProps<{
  visible: boolean
  models: ModelInfo[]
  modelValue: string
  threshold: number
  characterThreshold: number
  addCharacter: boolean
  addCopyright: boolean
  replaceUnderscores: boolean
  providers: string[]
}>()

const emit = defineEmits<{
  close: []
  refresh: []
  'update:modelValue': [value: string]
  'update:threshold': [value: number]
  'update:characterThreshold': [value: number]
  'update:addCharacter': [value: boolean]
  'update:addCopyright': [value: boolean]
  'update:replaceUnderscores': [value: boolean]
}>()

const catalog = ref<DownloadableModel[]>([])
const catalogError = ref('')
const downloadingId = ref('')
const downloadProgress = ref<{ modelId: string; received: number; total: number } | null>(null)
const downloadError = ref('')
let progressBound = false

function selectModel(path: string) {
  emit('update:modelValue', path)
}

function bindProgress() {
  if (progressBound || !window.taggerV2API?.onDownloadProgress) return
  progressBound = true
  window.taggerV2API.onDownloadProgress((event) => {
    downloadProgress.value = event
  })
}

async function loadCatalog() {
  if (!window.taggerV2API?.listDownloadableModels) return
  const result = await window.taggerV2API.listDownloadableModels()
  if (result.success && result.data) {
    catalog.value = result.data
    catalogError.value = ''
  } else {
    catalogError.value = result.error || '无法读取可下载模型'
  }
}

watch(() => props.visible, (visible) => {
  if (visible) {
    downloadError.value = ''
    void loadCatalog()
  }
}, { immediate: true })

async function downloadModel(id: string) {
  if (!window.taggerV2API || downloadingId.value) return
  bindProgress()
  downloadingId.value = id
  downloadError.value = ''
  downloadProgress.value = { modelId: id, received: 0, total: 0 }
  const before = new Set(props.models.map((model) => model.path))
  try {
    const result = await window.taggerV2API.downloadModel(id)
    emit('refresh')
    await loadCatalog()
    if (!result.success) {
      downloadError.value = result.error || '下载失败'
      return
    }
    const installed = result.data?.models ?? []
    const pick = installed.find((model) => !before.has(model.path)) ?? installed[installed.length - 1]
    if (pick) emit('update:modelValue', pick.path)
  } catch (error) {
    downloadError.value = error instanceof Error && error.message ? error.message : '下载失败'
  } finally {
    downloadingId.value = ''
    downloadProgress.value = null
  }
}

function progressPercent(itemId: string) {
  const progress = downloadProgress.value
  if (!progress || progress.modelId !== itemId || !progress.total) return 0
  return Math.min(100, Math.round((progress.received / progress.total) * 100))
}

function hasByteProgress(itemId: string) {
  const progress = downloadProgress.value
  return !!progress && progress.modelId === itemId && progress.total > 0
}

async function importModel() {
  const paths = await window.fsAPI.selectModels()
  if (!paths?.length) return
  for (const path of paths) await window.taggerV2API.importModel(path)
  emit('refresh')
  await loadCatalog()
}

async function openModelDirectory() {
  await window.taggerV2API.openModelDir()
}

function persist() {
  void window.taggerSettingsAPI?.save({
    generalThreshold: props.threshold,
    characterThreshold: props.characterThreshold,
    addCharacter: props.addCharacter,
    addCopyright: props.addCopyright,
    replaceUnderscores: props.replaceUnderscores,
  })
}

function done() {
  persist()
  emit('close')
}

const catalogBusy = computed(() => !!downloadingId.value)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="wd14-backdrop" @click.self="done">
      <section class="wd14-dialog" role="dialog" aria-modal="true" aria-labelledby="wd14-title">
        <header>
          <div>
            <p>WD14</p>
            <h2 id="wd14-title">标注参数</h2>
          </div>
          <button type="button" aria-label="关闭" @click="done">×</button>
        </header>

        <div class="wd14-body">
          <section class="wd14-section">
            <div class="wd14-section__head">
              <strong>已安装</strong>
              <div class="wd14-model__acts">
                <button type="button" @click="openModelDirectory">打开目录</button>
                <button type="button" @click="importModel">导入</button>
              </div>
            </div>
            <p v-if="!models.length" class="wd14-empty">还没有本地模型</p>
            <div v-else class="wd14-cards">
              <button
                v-for="model in models"
                :key="model.path"
                type="button"
                class="wd14-card"
                :class="{ 'is-selected': model.path === modelValue }"
                @click="selectModel(model.path)"
              >
                <span v-if="model.path === modelValue" class="wd14-card__check" aria-hidden="true">✓</span>
                <strong>{{ model.name }}</strong>
                <small>{{ model.resolution }}px · {{ model.provider || 'ONNX' }}</small>
              </button>
            </div>
          </section>

          <section class="wd14-section">
            <div class="wd14-section__head">
              <strong>下载</strong>
            </div>
            <p v-if="catalogError" class="wd14-empty">{{ catalogError }}</p>
            <p v-else-if="!catalog.length" class="wd14-empty">暂无可下载模型</p>
            <div v-else class="wd14-downloads">
              <div v-for="item in catalog" :key="item.id" class="wd14-dl">
                <div class="wd14-dl__meta">
                  <strong>{{ item.name }}</strong>
                  <small>{{ item.repo }}</small>
                </div>
                <button
                  v-if="item.installed"
                  type="button"
                  class="wd14-dl__btn"
                  disabled
                >已安装</button>
                <button
                  v-else
                  type="button"
                  class="wd14-dl__btn wd14-dl__btn--go"
                  :disabled="catalogBusy"
                  @click="downloadModel(item.id)"
                >{{ downloadingId === item.id ? '下载中…' : '下载' }}</button>
                <div
                  v-if="downloadingId === item.id && hasByteProgress(item.id)"
                  class="wd14-dl__bar"
                  role="progressbar"
                  :aria-valuenow="progressPercent(item.id)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <i :style="{ width: progressPercent(item.id) + '%' }" />
                </div>
              </div>
            </div>
            <p v-if="downloadError" class="wd14-error">{{ downloadError }}</p>
          </section>

          <label class="wd14-slider">
            <span>通用标签阈值 <b>{{ threshold.toFixed(2) }}</b></span>
            <input type="range" min="0" max="1" step="0.01" :value="threshold" @input="emit('update:threshold', Number(($event.target as HTMLInputElement).value))" @change="persist" />
          </label>
          <label class="wd14-slider">
            <span>角色标签阈值 <b>{{ characterThreshold.toFixed(2) }}</b></span>
            <input type="range" min="0" max="1" step="0.01" :value="characterThreshold" @input="emit('update:characterThreshold', Number(($event.target as HTMLInputElement).value))" @change="persist" />
          </label>

          <label class="wd14-switch">
            <span>加入角色标签</span>
            <input type="checkbox" :checked="addCharacter" @change="emit('update:addCharacter', ($event.target as HTMLInputElement).checked); persist()" />
          </label>
          <label class="wd14-switch">
            <span>加入版权标签</span>
            <input type="checkbox" :checked="addCopyright" @change="emit('update:addCopyright', ($event.target as HTMLInputElement).checked); persist()" />
          </label>
          <label class="wd14-switch">
            <span>下划线转空格</span>
            <input type="checkbox" :checked="replaceUnderscores" @change="emit('update:replaceUnderscores', ($event.target as HTMLInputElement).checked); persist()" />
          </label>
        </div>

        <footer>
          <button type="button" class="wd14-done" @click="done">完成</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.wd14-backdrop {
  position: fixed; inset: 0; z-index: 650;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  background: rgba(49, 71, 46, 0.32); backdrop-filter: blur(6px);
}
.wd14-dialog {
  width: min(520px, 100%);
  max-height: min(86vh, 760px);
  display: flex; flex-direction: column;
  border: 1px solid var(--line-subtle);
  border-radius: 12px;
  background: var(--surface-primary, #19171d);
  box-shadow: var(--surface-shadow-lg);
}
.wd14-dialog header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--line-subtle);
}
.wd14-dialog header p { margin: 0 0 2px; color: var(--brand-primary); font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.wd14-dialog h2 { margin: 0; font-size: 18px; color: var(--text-primary); }
.wd14-dialog header > button {
  width: 32px; height: 32px; border: 1px solid var(--line-subtle);
  border-radius: 8px; background: transparent; color: var(--text-tertiary); cursor: pointer; font-size: 18px;
}
.wd14-body { display: grid; gap: 14px; padding: 16px 18px; overflow: auto; }
.wd14-section { display: grid; gap: 8px; }
.wd14-section__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.wd14-section__head strong { color: var(--text-primary); font-size: 12px; letter-spacing: .04em; }
.wd14-model__acts { display: flex; gap: 8px; flex: none; }
.wd14-model__acts button {
  border: 0; background: transparent; color: var(--brand-primary); cursor: pointer; font-size: 12px;
}
.wd14-empty { margin: 0; color: var(--text-tertiary); font-size: 12px; }
.wd14-error { margin: 0; color: var(--danger-foreground); font-size: 12px; }
.wd14-cards { display: grid; gap: 8px; }
.wd14-card {
  position: relative;
  display: grid; gap: 2px; text-align: left;
  padding: 10px 12px 10px 14px;
  border: 1px solid var(--line-subtle);
  border-radius: 10px;
  background: var(--surface-secondary);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.wd14-card strong { color: var(--text-primary); font-size: 13px; }
.wd14-card small { color: var(--text-tertiary); font-size: 11px; }
.wd14-card.is-selected {
  border-color: color-mix(in srgb, var(--brand-primary) 70%, transparent);
  background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-primary) 45%, transparent);
}
.wd14-card__check {
  position: absolute; top: 10px; right: 10px;
  color: var(--brand-primary); font-size: 13px; font-weight: 800;
}
.wd14-downloads { display: grid; gap: 8px; }
.wd14-dl {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 6px 10px;
  padding: 8px 10px;
  border: 1px solid var(--line-subtle);
  border-radius: 10px;
}
.wd14-dl__meta { min-width: 0; display: grid; gap: 2px; }
.wd14-dl__meta strong { color: var(--text-primary); font-size: 13px; }
.wd14-dl__meta small { color: var(--text-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wd14-dl__btn {
  height: 28px; padding: 0 10px;
  border: 1px solid var(--line-subtle);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
}
.wd14-dl__btn:disabled { opacity: .45; cursor: not-allowed; }
.wd14-dl__btn--go { color: var(--brand-primary); border-color: color-mix(in srgb, var(--brand-primary) 40%, transparent); cursor: pointer; }
.wd14-dl__bar {
  grid-column: 1 / -1;
  height: 3px;
  border-radius: 99px;
  background: var(--surface-tertiary);
  overflow: hidden;
}
.wd14-dl__bar i {
  display: block; height: 100%;
  background: var(--brand-primary);
}
.wd14-slider { display: grid; gap: 8px; }
.wd14-slider span { display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 13px; }
.wd14-slider b { color: var(--brand-primary); font-variant-numeric: tabular-nums; }
.wd14-slider input { width: 100%; accent-color: var(--brand-primary); }
.wd14-switch { display: flex; align-items: center; justify-content: space-between; color: var(--text-secondary); font-size: 13px; }
.wd14-switch input { accent-color: var(--brand-primary); width: 16px; height: 16px; }
.wd14-dialog footer { padding: 12px 18px 16px; }
.wd14-done {
  width: 100%; height: 38px; border: 0; border-radius: 8px;
  background: var(--brand-primary); color: var(--brand-on-primary, #fff);
  font-weight: 700; cursor: pointer;
}
</style>

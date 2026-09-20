<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { compiledPrompt, loadLlmPromptState } from './llm-prompt-state'
import { toIpcPayload } from '@/lib/ipc-payload'

const props = defineProps<{
  visible: boolean
  imagePaths: string[]
  selectedImagePaths?: string[]
  modelPath?: string
  csvPath?: string | null
  threshold?: number
  providers?: string[]
  initialSource?: 'local' | 'llm' | 'combined'
  normalization?: string
  padColor?: number[]
  resizeMode?: string
  inputLayout?: string
  resolution?: number
}>()

const emit = defineEmits<{ close: []; applied: []; failed: [message: string] }>()

function reportError(message: string) {
  const text = visibleLlmError(message)
  error.value = text
  try { void window.logAPI?.append?.(toIpcPayload({ type: 'error', message: '[标注] ' + text, source: 'tagging' })) } catch { /* */ }
  emit('failed', text)
}

type Source = 'local' | 'llm' | 'natural' | 'combined'
type Conflict = 'skip' | 'overwrite' | 'mergePrefix' | 'mergeSuffix'

const source = ref<Source>('local')
const modeKey = ref('local')
const outputFormat = ref<'danbooru' | 'natural' | 'both'>('danbooru')
const templateId = ref('danbooru-tags')
const customPrompt = ref('')
const scope = ref<'selected' | 'all' | 'unannotated'>('unannotated')
const conflict = ref<Conflict>('skip')
const mergeStrategy = ref<'union' | 'intersect' | 'difference' | 'a_only' | 'b_only'>('b_only')
const concurrency = ref(2)
const targetRpm = ref(0)
const selectedConfigIds = ref<string[]>([])
const busy = ref(false)
const error = ref('')
const results = ref<TaggingResult[]>([])
const taskId = ref('')
const progressText = ref('')
const customTemplates = ref<TaggingPromptTemplate[]>([])
const apiConfigs = ref<WorkbenchApiConfig[]>([])

const builtinTemplates: TaggingPromptTemplate[] = [
  { id: 'danbooru-tags', name: 'Danbooru Tags', prompt: '' },
  { id: 'natural', name: 'Natural Language', prompt: '' },
  { id: 'tags-and-natural', name: 'Tags + Natural', prompt: '' },
]

const allTemplates = computed(() => [...builtinTemplates, ...customTemplates.value])
const selectedCount = computed(() => props.selectedImagePaths?.length ?? 0)
const canStart = computed(() => props.imagePaths.length > 0 && !busy.value)

const MISSING_API_KEY_HINT = '先到设置 → 接口填写 API 密钥'

function visibleLlmError(message?: string, fallback = '生成失败') {
  const text = String(message || '')
  if (/API Key/i.test(text) || text.includes('未配置') || text.includes('密钥') || text.includes(MISSING_API_KEY_HINT)) {
    return MISSING_API_KEY_HINT
  }
  return text || fallback
}


function applyModeKey(key: string) {
  modeKey.value = key
  if (key === 'local') {
    source.value = 'local'
    selectedConfigIds.value = []
    return
  }
  if (key === 'combined') {
    source.value = 'combined'
    selectedConfigIds.value = apiConfigs.value[0] ? [apiConfigs.value[0].id] : []
    return
  }
  source.value = 'llm'
  const id = key.startsWith('llm:') ? key.slice(4) : ''
  selectedConfigIds.value = id ? [id] : []
}

function syncPromptState() {
  const prompt = loadLlmPromptState()
  outputFormat.value = prompt.outputFormat
  templateId.value = prompt.templateId
  customPrompt.value = compiledPrompt(prompt)
}

function selectedApiConfig(): WorkbenchApiConfig | null {
  const id = selectedConfigIds.value[0]
  return apiConfigs.value.find((cfg) => cfg.id === id) || apiConfigs.value[0] || null
}

function schedulingFromConfig(cfg: WorkbenchApiConfig | null) {
  const rpm = cfg && cfg.targetRpm !== undefined && cfg.targetRpm !== null
    ? Math.max(0, Number(cfg.targetRpm) || 0)
    : 5
  return {
    targetRpm: rpm,
    concurrency: cfg?.requestMode === 'concurrent' ? 4 : 1,
  }
}

function buildParams(): TaggingOptions {
  const prompt = loadLlmPromptState()
  const compiled = compiledPrompt(prompt)
  customPrompt.value = compiled
  outputFormat.value = prompt.outputFormat
  templateId.value = prompt.templateId
  const cfg = selectedApiConfig()
  const ids = selectedConfigIds.value.length
    ? selectedConfigIds.value
    : (apiConfigs.value.length ? apiConfigs.value.map((item) => item.id) : (cfg?.id ? [cfg.id] : []))
  const schedule = schedulingFromConfig(cfg)
  concurrency.value = schedule.concurrency
  targetRpm.value = schedule.targetRpm
  const nextOutputFormat = source.value === 'natural' ? 'natural' : prompt.outputFormat
  const imagePaths = scope.value === 'selected'
    ? (props.selectedImagePaths?.length ? [...props.selectedImagePaths] : props.imagePaths.slice(0, 1))
    : [...props.imagePaths]
  return {
    source: source.value,
    outputFormat: nextOutputFormat,
    templateId: prompt.templateId,
    customPrompt: compiled,
    imagePaths,
    taskId: taskId.value,
    scope: scope.value,
    conflict: conflict.value,
    writeMode: conflict.value,
    mergeStrategy: source.value === 'combined' ? mergeStrategy.value : undefined,
    concurrency: schedule.concurrency,
    retries: 2,
    targetRpm: schedule.targetRpm,
    apiConfigIds: [...ids],
    modelPath: props.modelPath || undefined,
    csvPath: props.csvPath || undefined,
    threshold: props.threshold ?? 0.35,
    providers: props.providers?.length ? [...props.providers] : ['cpu'],
    normalization: props.normalization,
    padColor: Array.isArray(props.padColor) ? [...props.padColor] : undefined,
    resizeMode: props.resizeMode,
    inputLayout: props.inputLayout,
    resolution: props.resolution,
  }
}

async function generate() {
  if (props.imagePaths.length === 0 || !window.taggingAPI) return false
  results.value = []
  taskId.value = `tagging_${Date.now()}`
  progressText.value = ''
  const response = await window.taggingAPI.generate(toIpcPayload(buildParams()))
  if (!response.success) {
    reportError(response.error || '生成失败')
    return false
  }
  if (!response.data?.length) {
    reportError('当前范围内没有可标注的图片。')
    return false
  }
  const firstErr = response.data.find((item) => item.error)?.error
  const allFailed = response.data.every((item) => item.error && !(item.tags && item.tags.length))
  if (allFailed) {
    reportError(firstErr || response.error || '生成失败')
    results.value = response.data
    return false
  }
  if (firstErr) reportError(firstErr)
  results.value = response.data
  return await apply()
}

async function apply() {
  if (!results.value.length || !window.taggingAPI) return false
  const response = await window.taggingAPI.apply(toIpcPayload({
    results: results.value,
    conflict: conflict.value,
    writeMode: conflict.value,
  }))
  if (!response.success) {
    reportError(visibleLlmError(response.error, '写入失败'))
    return false
  }
  return true
}

function cancel() {
  if (taskId.value) void window.taggingAPI.cancel(taskId.value)
}

async function startAnnotate() {
  if (!canStart.value || !window.taggingAPI) return
  applyModeKey(modeKey.value)
  syncPromptState()
  busy.value = true
  error.value = ''
  try {
    if ((source.value === 'local' || source.value === 'combined') && !props.modelPath) {
      reportError('请先选择一个可用的标注模型。')
      return
    }
    if (source.value !== 'local') {
      const hasConfig = Boolean(selectedApiConfig() || apiConfigs.value.length)
      let hasFallbackKey = false
      try {
        const cfg = await window.llmAPI?.getConfig()
        hasFallbackKey = Boolean(String(cfg?.apiKey || '').trim())
      } catch {
        hasFallbackKey = false
      }
      if (!hasConfig && !hasFallbackKey) {
        reportError(MISSING_API_KEY_HINT)
        return
      }
    }
    const generated = await generate()
    if (!generated) return
    emit('applied')
    emit('close')
  } finally {
    busy.value = false
  }
}

async function resetDialog() {
  syncPromptState()
  conflict.value = 'skip'
  error.value = ''
  progressText.value = ''
  results.value = []
  busy.value = false
  scope.value = selectedCount.value > 0 ? 'selected' : 'unannotated'
  if (!window.taggingAPI) return
  const [templateResponse, configResponse] = await Promise.all([
    window.taggingAPI.listTemplates(),
    window.taggingAPI.listConfigs(),
  ])
  if (templateResponse.success) customTemplates.value = templateResponse.data?.templates ?? []
  if (configResponse.success) apiConfigs.value = configResponse.data?.configs ?? []
  const requested = props.initialSource || 'local'
  if (requested === 'llm') {
    const first = apiConfigs.value[0]
    applyModeKey(first ? ('llm:' + first.id) : 'llm:')
  } else if (requested === 'combined') {
    applyModeKey('combined')
  } else {
    applyModeKey('local')
  }
}

watch(() => props.visible, (visible) => {
  if (visible) void resetDialog()
})

watch(selectedCount, (count) => {
  if (count === 0 && scope.value === 'selected') scope.value = 'unannotated'
})

onMounted(async () => {
  if (!window.taggingAPI) return
  window.taggingAPI.onProgress((progress) => {
    if (progress.taskId === taskId.value) progressText.value = `${progress.completed} / ${progress.total}`
  })
  if (props.visible) await resetDialog()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="run-title">
        <header>
          <h2 id="run-title">执行标注</h2>
          <button type="button" class="icon-close" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="dialog-body">
          <section class="field-card">
            <div class="field-row">
              <div class="field-label">标注模式</div>
              <select :value="modeKey" @change="applyModeKey(($event.target as HTMLSelectElement).value)">
                <option value="local">本地WD14标注器</option>
                <optgroup label="云端 LLM">
                  <option v-if="!apiConfigs.length" value="llm:">云端 LLM（默认设置）</option>
                  <option v-for="config in apiConfigs" :key="config.id" :value="'llm:' + config.id">
                    {{ config.name || '云端 LLM（默认设置）' }}
                  </option>
                </optgroup>
                <optgroup label="组合">
                  <option value="combined">本地 + LLM</option>
                </optgroup>
              </select>
            </div>
            <div class="field-row">
              <div class="field-label">标注范围</div>
              <select v-model="scope">
                <option value="selected" :disabled="selectedCount === 0">选中图片（{{ selectedCount }} 张）</option>
                <option value="all">所有图片</option>
                <option value="unannotated">无标图片</option>
              </select>
            </div>
            <div class="field-row">
              <div class="field-label">冲突管理</div>
              <select v-model="conflict">
                <option value="skip">跳过</option>
                <option value="overwrite">覆盖</option>
                <option value="mergePrefix">合并为前缀</option>
                <option value="mergeSuffix">合并为后缀</option>
              </select>
            </div>
          </section>

          <p v-if="progressText" class="progress">{{ progressText }}</p>
          <p v-if="error" class="operation-error">{{ error }}</p>

          <div class="dialog-actions">
            <button v-if="busy" type="button" @click="cancel">取消</button>
            <button class="primary" type="button" :disabled="!canStart" @click="startAnnotate">
              {{ busy ? '标注中…' : '开始标注' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0; z-index: 700;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  background: rgba(7, 6, 9, 0.42);
}
.dialog-card {
  width: min(460px, 100%);
  display: flex; flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line-subtle, rgba(255,255,255,.1));
  border-radius: 12px;
  background: var(--surface-primary, #19171d);
  box-shadow: 0 24px 72px rgba(0,0,0,.36);
}
.dialog-card header {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; padding: 0 20px;
  border-bottom: 1px solid var(--line-subtle, rgba(255,255,255,.08));
}
.dialog-card h2 { margin: 0; font-size: 15px; font-weight: 650; color: var(--text-primary); }
.icon-close {
  width: 32px; height: 32px; border: 1px solid var(--line-subtle, rgba(255,255,255,.08));
  border-radius: 8px; background: transparent; color: var(--text-tertiary); cursor: pointer; font-size: 18px;
}
.dialog-body { display: grid; gap: 12px; padding: 20px; background: rgba(255,255,255,.015); }
.field-card {
  border: 1px solid var(--line-subtle, rgba(255,255,255,.08));
  border-radius: 10px;
  background: rgba(255,255,255,.02);
  overflow: hidden;
}
.field-row {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 12px 16px;
}
.field-row + .field-row { border-top: 1px solid rgba(255,255,255,.06); }
.field-label { color: var(--text-primary); font-size: 13px; font-weight: 650; }
.field-row select {
  box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px;
  border: 1px solid rgba(255,255,255,.08); border-radius: 8px;
  background: rgba(255,255,255,.035); color: var(--text-primary);
  outline: none; font: inherit; font-size: 13px;
}
.operation-error { margin: 0; color: #ff9a86; font-size: 12px; }
.progress { margin: 0; color: var(--text-tertiary); font-size: 12px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
.dialog-actions button {
  height: 32px; padding: 0 12px;
  border: 1px solid rgba(255,255,255,.08); border-radius: 8px;
  background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; font-size: 13px;
}
.dialog-actions .primary {
  border-color: transparent; background: var(--accent-primary, #111); color: #fff; font-weight: 650;
}
.dialog-actions button:disabled { opacity: .38; cursor: not-allowed; }
</style>

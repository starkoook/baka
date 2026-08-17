<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{
  visible: boolean
  imagePaths: string[]
  modelPath?: string
  csvPath?: string | null
  threshold?: number
  providers?: string[]
}>()

const emit = defineEmits<{ close: []; applied: [] }>()

const source = ref<'local' | 'llm' | 'natural' | 'combined'>('llm')
const outputFormat = ref<'danbooru' | 'natural' | 'both'>('danbooru')
const templateId = ref('danbooru-tags')
const customPrompt = ref('')
const writeMode = ref<'replace' | 'append' | 'skip_existing' | 'empty_only'>('replace')
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
const isCustomTemplate = computed(() => customTemplates.value.some((template) => template.id === templateId.value))
const activeResult = computed(() => results.value[0] ?? null)
const selectedConfigLabel = computed(() => {
  if (!selectedConfigIds.value.length) return '默认设置'
  const names = selectedConfigIds.value
    .map((id) => apiConfigs.value.find((config) => config.id === id)?.name)
    .filter(Boolean)
  return names.length ? names.join('、') : '默认设置'
})

function toggleConfig(id: string) {
  const index = selectedConfigIds.value.indexOf(id)
  if (index >= 0) selectedConfigIds.value.splice(index, 1)
  else selectedConfigIds.value.push(id)
}

function toggleAllConfigs() {
  if (selectedConfigIds.value.length === apiConfigs.value.length) {
    selectedConfigIds.value = []
  } else {
    selectedConfigIds.value = apiConfigs.value.map((config) => config.id)
  }
}

function buildParams(): TaggingOptions {
  const nextOutputFormat = source.value === 'natural' ? 'natural' : outputFormat.value
  const resolvedTemplate = allTemplates.value.find((template) => template.id === templateId.value)
  return {
    source: source.value,
    outputFormat: nextOutputFormat,
    templateId: templateId.value,
    customPrompt: customPrompt.value || resolvedTemplate?.prompt || undefined,
    imagePaths: props.imagePaths,
    taskId: taskId.value,
    writeMode: writeMode.value,
    mergeStrategy: source.value === 'combined' ? mergeStrategy.value : undefined,
    concurrency: concurrency.value,
    retries: 2,
    targetRpm: targetRpm.value,
    apiConfigIds: selectedConfigIds.value.length ? selectedConfigIds.value : undefined,
    modelPath: props.modelPath || undefined,
    csvPath: props.csvPath || undefined,
    threshold: props.threshold ?? 0.35,
    providers: props.providers || ['cpu'],
  }
}

async function generate() {
  if (props.imagePaths.length === 0 || !window.taggingAPI) return
  busy.value = true
  error.value = ''
  results.value = []
  taskId.value = `tagging_${Date.now()}`
  progressText.value = ''
  const response = await window.taggingAPI.generate(buildParams())
  busy.value = false
  if (!response.success || !response.data?.length) {
    error.value = response.error || '生成失败'
    return
  }
  results.value = response.data
}

function cancel() {
  if (taskId.value) void window.taggingAPI.cancel(taskId.value)
}

async function apply() {
  if (!results.value.length || !window.taggingAPI) return
  const response = await window.taggingAPI.apply({ results: results.value, writeMode: writeMode.value })
  if (!response.success) {
    error.value = response.error || '写入失败'
    return
  }
  emit('applied')
  emit('close')
}

onMounted(async () => {
  if (!window.taggingAPI) return
  const [templateResponse, configResponse] = await Promise.all([
    window.taggingAPI.listTemplates(),
    window.taggingAPI.listConfigs(),
  ])
  if (templateResponse.success) customTemplates.value = templateResponse.data?.templates ?? []
  if (configResponse.success) apiConfigs.value = configResponse.data?.configs ?? []

  window.taggingAPI.onProgress((progress) => {
    if (progress.taskId === taskId.value) progressText.value = `${progress.completed} / ${progress.total}`
  })
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog-card">
        <div><p>TAGGING PIPELINE</p><h2>统一打标</h2></div>

        <div class="dialog-tabs">
          <button :class="{ active: source === 'llm' }" @click="source = 'llm'">LLM</button>
          <button :class="{ active: source === 'natural' }" @click="source = 'natural'">自然语言</button>
          <button :class="{ active: source === 'combined' }" @click="source = 'combined'">本地 + LLM</button>
          <button :class="{ active: source === 'local' }" @click="source = 'local'">本地</button>
        </div>

        <div class="dialog-fields">
          <div v-if="source !== 'local'" class="field-grid">
            <label>输出模式
              <select v-model="outputFormat" :disabled="source === 'natural'">
                <option value="danbooru">标签</option>
                <option value="natural">自然语言</option>
                <option value="both">标签 + 自然语言</option>
              </select>
            </label>
            <label>提示词模板
              <select v-model="templateId">
                <option v-for="template in allTemplates" :key="template.id" :value="template.id">{{ template.name }}</option>
              </select>
            </label>
          </div>

          <label v-if="isCustomTemplate">自定义提示词
            <textarea v-model="customPrompt" rows="4" placeholder="留空则使用模板内置提示词"></textarea>
          </label>

          <label v-if="source === 'combined'">结果融合
            <select v-model="mergeStrategy">
              <option value="union">并集（本地 + LLM）</option>
              <option value="intersect">交集（两者都有的）</option>
              <option value="difference">差集（本地有、LLM 没有）</option>
              <option value="a_only">仅本地</option>
              <option value="b_only">仅 LLM</option>
            </select>
          </label>

          <label>写入模式
            <select v-model="writeMode">
              <option value="replace">全部替换</option>
              <option value="append">追加</option>
              <option value="skip_existing">跳过已有标签</option>
              <option value="empty_only">只处理空标签</option>
            </select>
          </label>

          <div class="field-grid">
            <label>并发数
              <select v-model.number="concurrency">
                <option v-for="n in 6" :key="n" :value="n">{{ n }}</option>
              </select>
            </label>
            <label>限速（次/分钟）
              <select v-model.number="targetRpm">
                <option :value="0">不限</option>
                <option :value="5">5</option>
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="30">30</option>
                <option :value="60">60</option>
              </select>
            </label>
            <label>API 配置
              <button class="config-picker" type="button" @click="toggleAllConfigs">{{ selectedConfigLabel }} ▾</button>
            </label>
          </div>

          <div v-if="apiConfigs.length" class="config-list">
            <button
              v-for="config in apiConfigs"
              :key="config.id"
              :class="{ active: selectedConfigIds.includes(config.id) }"
              type="button"
              @click="toggleConfig(config.id)"
            >
              <span>{{ config.name }}</span>
              <small>{{ config.model || config.provider }}</small>
            </button>
          </div>
        </div>

        <div v-if="activeResult" class="result-list">
          <article v-for="result in results" :key="result.imagePath" class="result-item">
            <strong>{{ (result.imagePath || '').split(/[/\\]/).pop() }}</strong>
            <pre>{{ result.error || (result.tags.join(', ') + (result.natural ? '\n\n' + result.natural : '')) }}</pre>
          </article>
        </div>

        <p v-if="progressText" class="progress">{{ progressText }}</p>
        <p v-if="error" class="operation-error">{{ error }}</p>

        <footer>
          <button @click="emit('close')">取消</button>
          <button :disabled="busy" @click="generate">{{ busy ? '生成中…' : '生成预览' }}</button>
          <button v-if="busy" @click="cancel">取消</button>
          <button class="primary" :disabled="!results.length || busy" @click="apply">写入全部</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 700; display: grid; place-items: center; padding: 20px; background: rgba(7,6,9,.68); backdrop-filter: blur(9px); }
.dialog-card { width: min(680px, 100%); max-height: min(90vh, 820px); display: flex; flex-direction: column; padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: #1c1921; box-shadow: 0 30px 80px rgba(0,0,0,.48); }
.dialog-card h2 { margin: 0; font-size: 19px; }
.dialog-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 20px 0 12px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,.03); }
.dialog-tabs button { height: 32px; border: 0; border-radius: 7px; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.dialog-tabs button.active { background: rgba(var(--accent-primary-rgb),.12); color: var(--accent-primary); }
.dialog-fields { display: grid; gap: 13px; }
.dialog-fields label { display: grid; gap: 6px; color: var(--text-tertiary); font-size: 9px; }
.dialog-fields select, .dialog-fields textarea, .config-picker { box-sizing: border-box; width: 100%; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; }
.dialog-fields select, .config-picker { height: 36px; padding: 0 10px; text-align: left; }
.dialog-fields textarea { padding: 10px; resize: vertical; line-height: 1.6; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.config-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; max-height: 120px; overflow: auto; }
.config-list button { display: flex; flex-direction: column; gap: 3px; padding: 8px 9px; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; background: rgba(255,255,255,.02); color: var(--text-tertiary); cursor: pointer; text-align: left; }
.config-list button.active { border-color: rgba(var(--accent-primary-rgb),.45); background: rgba(var(--accent-primary-rgb),.08); }
.config-list span { color: var(--text-secondary); font-size: 9px; }
.config-list small { color: var(--text-tertiary); font-size: 7px; }
.result-list { display: grid; gap: 7px; max-height: 220px; overflow: auto; margin-top: 14px; }
.result-item { padding: 8px 9px; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; background: rgba(0,0,0,.18); }
.result-item strong { display: block; margin-bottom: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 9px; }
.result-item pre { margin: 0; max-height: 72px; overflow: auto; color: var(--text-tertiary); font: 8px/1.7 ui-monospace, monospace; white-space: pre-wrap; }
.operation-error { margin: 10px 0 0; color: #ff9a86; font-size: 9px; }
.progress { margin-top: 10px; color: var(--text-tertiary); font-size: 9px; }
.dialog-card footer { display: flex; justify-content: flex-end; gap: 7px; margin-top: 20px; }
.dialog-card footer button { height: 34px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; }
.dialog-card footer .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
</style>

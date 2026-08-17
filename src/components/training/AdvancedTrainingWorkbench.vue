<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { waitForTrainingBackend } from '@/features/training/training-readiness'
import {
  collectVisibleFields,
  materializeDefaults,
  validateTrainingDraft,
  type TrainingSchemaNode,
} from '@/features/training/schema-form'

interface CompiledSchema {
  name: string
  hash: string
  schema: TrainingSchemaNode
  fieldCount: number
}

const router = useRouter()
const schemas = ref<CompiledSchema[]>([])
const unsupported = ref<Array<{ schema: string; message: string }>>([])
const presets = ref<any[]>([])
const selectedSchemaName = ref('')
const draft = ref<Record<string, any>>({})
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const notices = ref<string[]>([])
const datasetHandoff = ref<any>(null)

const selectedSchema = computed(() => schemas.value.find(item => item.name === selectedSchemaName.value) || null)
const visibleFields = computed(() => selectedSchema.value
  ? collectVisibleFields(selectedSchema.value.schema, draft.value)
  : [])
const groupedFields = computed(() => {
  const groups = new Map<string, typeof visibleFields.value>()
  for (const field of visibleFields.value) {
    const items = groups.get(field.section) || []
    items.push(field)
    groups.set(field.section, items)
  }
  return [...groups.entries()].map(([title, fields]) => ({ title, fields }))
})
const matchingPresets = computed(() => presets.value.filter((preset) => {
  const type = preset?.metadata?.train_type || preset?.data?.model_train_type
  return !type || type === selectedSchemaName.value
}))

async function ensureBackend() {
  const status = await window.runtimeAPI?.scan()
  if (!status?.hasRepo) throw new Error('没有找到训练器核心，请先到运行时管理进行修复。')
  const installed = status.runtimes?.find(runtime => runtime.status === 'installed')
  if (!installed) throw new Error('尚未安装训练环境，请先到运行时管理完成自动安装。')
  const gui = await window.runtimeAPI?.guiStatus()
  if (!gui?.running) {
    const launched = await window.runtimeAPI?.launch({ runtimeId: installed.id, port: 28000 })
    if (!launched?.success) throw new Error(launched?.error || '训练后端启动失败')
  }
  const ready = await waitForTrainingBackend(async () => (
    await window.trainingHttpAPI?.backendStatus() ?? { ok: false }
  ))
  if (!ready) throw new Error('训练后端在 30 秒内没有准备完成，请检查运行时日志。')
}

function restoreDraft(schema: CompiledSchema) {
  let saved: Record<string, any> = {}
  try {
    const raw = localStorage.getItem(`baka-training-draft:${schema.name}`)
    if (raw) saved = JSON.parse(raw)?.draft || {}
  } catch {}
  draft.value = materializeDefaults(schema.schema, saved)
  try {
    const handoff = JSON.parse(localStorage.getItem('baka-training-dataset-handoff') || 'null')
    datasetHandoff.value = handoff
    if (handoff?.datasetPath) draft.value.train_data_dir = handoff.datasetPath
  } catch {}
}

async function loadCompleteTrainer() {
  loading.value = true
  error.value = ''
  try {
    await ensureBackend()
    const response = await window.trainingHttpAPI.getSchemas()
    if (!response.ok || !Array.isArray(response.data?.schemas)) {
      throw new Error(response.data?.error || '无法读取训练参数定义')
    }
    schemas.value = response.data.schemas
    unsupported.value = response.data.unsupported || []
    const presetResponse = await window.trainingHttpAPI.getPresets()
    presets.value = presetResponse.data?.data?.presets || []
    const preferred = schemas.value.find(item => item.name === 'lora-master') || schemas.value[0]
    selectedSchemaName.value = preferred?.name || ''
    if (preferred) restoreDraft(preferred)
  } catch (cause: any) {
    error.value = cause?.message || String(cause)
  } finally {
    loading.value = false
  }
}

watch(selectedSchemaName, (name, oldName) => {
  if (!name || name === oldName) return
  localStorage.setItem('baka-training-last-schema', name)
  const schema = schemas.value.find(item => item.name === name)
  if (schema) restoreDraft(schema)
})

watch(draft, (value) => {
  if (!selectedSchema.value) return
  localStorage.setItem(`baka-training-draft:${selectedSchema.value.name}`, JSON.stringify({
    hash: selectedSchema.value.hash,
    draft: value,
  }))
}, { deep: true })

async function pickPath(field: any) {
  const role = field.schema.meta?.role
  if (role?.name !== 'filepicker') return
  if (role.options?.type === 'model-file') {
    const files = await window.fsAPI.selectModels()
    if (files?.[0]) draft.value[field.key] = files[0]
  } else {
    const folder = await window.fsAPI.selectFolder()
    if (folder) draft.value[field.key] = folder
  }
}

function applyPreset(preset: any) {
  if (!selectedSchema.value) return
  draft.value = materializeDefaults(selectedSchema.value.schema, { ...draft.value, ...(preset.data || {}) })
}

function resetDraft() {
  if (selectedSchema.value) draft.value = materializeDefaults(selectedSchema.value.schema)
}

async function chooseExistingNetwork() {
  const files = await window.fsAPI.selectModels()
  if (!files?.[0]) return
  const target = visibleFields.value.find(field => ['network_weights', 'resume', 'base_weights'].includes(field.key))
  if (!target) {
    error.value = '当前训练类型没有继续训练字段，请切换到支持断点续训或已有 LoRA 的类型。'
    return
  }
  draft.value[target.key] = files[0]
}

function exportDraft() {
  const blob = new Blob([JSON.stringify(draft.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${selectedSchemaName.value || 'training'}-config.json`
  link.click()
  URL.revokeObjectURL(url)
}

function importDraft() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file || !selectedSchema.value) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        draft.value = materializeDefaults(selectedSchema.value!.schema, JSON.parse(String(reader.result)))
        error.value = ''
      } catch (cause: any) {
        error.value = `配置导入失败：${cause?.message || cause}`
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

async function submitAdvancedTraining() {
  if (!selectedSchema.value) return
  notices.value = []
  const issues = validateTrainingDraft(selectedSchema.value.schema, draft.value)
  if (issues.length) {
    error.value = issues.slice(0, 8).map(issue => issue.message).join('；')
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const config = { ...draft.value }
    const preflight = await window.trainingHttpAPI.preflight(config)
    const report = preflight.data?.data || {}
    notices.value = report.warnings || []
    const errors = report.errors || (preflight.data?.status === 'fail' ? [preflight.data?.message] : [])
    if (!preflight.ok || errors.length) throw new Error(errors.filter(Boolean).join('；') || '训练预检失败')
    const response = await window.trainingHttpAPI.submitTraining(config)
    if (!response.ok || response.data?.status === 'fail') {
      throw new Error(response.data?.message || response.data?.error || '训练任务提交失败')
    }
    const taskId = response.data?.data?.task_id
    if (!taskId) throw new Error('训练器没有返回任务编号')
    await router.push({ path: '/training/run', query: { taskId } })
  } catch (cause: any) {
    error.value = cause?.message || String(cause)
  } finally {
    submitting.value = false
  }
}

onMounted(loadCompleteTrainer)
</script>

<template>
  <section class="advanced-workbench">
    <div v-if="loading" class="advanced-state"><strong>正在启动完整训练器…</strong><span>读取训练类型、全部参数和预设。</span></div>
    <div v-else-if="error && !schemas.length" class="advanced-state advanced-state--error"><strong>完整训练器暂时不可用</strong><span>{{ error }}</span><button @click="loadCompleteTrainer">重新检查</button><router-link to="/training/runtime">运行时管理</router-link></div>
    <template v-else>
      <header class="advanced-toolbar">
        <label>训练类型<select v-model="selectedSchemaName"><option v-for="item in schemas" :key="item.name" :value="item.name">{{ item.name }} · {{ item.fieldCount }} 项</option></select></label>
        <label v-if="matchingPresets.length">训练预设<select @change="applyPreset(matchingPresets[Number(($event.target as HTMLSelectElement).value)])"><option value="">选择预设</option><option v-for="(preset, index) in matchingPresets" :key="index" :value="index">{{ preset.metadata?.name || `预设 ${index + 1}` }}</option></select></label>
        <span class="advanced-toolbar__spacer"></span>
        <button @click="chooseExistingNetwork">继续现有模型</button><button @click="importDraft">导入</button><button @click="exportDraft">导出</button><button @click="resetDraft">恢复默认</button>
      </header>

      <div v-if="unsupported.length" class="advanced-warning"><strong>有 {{ unsupported.length }} 个定义无法兼容，已停止隐藏处理。</strong><span v-for="item in unsupported" :key="item.schema">{{ item.schema }}：{{ item.message }}</span><router-link to="/training/run">使用原版训练界面</router-link></div>
      <div v-if="datasetHandoff" class="advanced-dataset-health"><strong>{{ datasetHandoff.datasetName }}</strong><span>{{ datasetHandoff.imageCount }} 张图片 · {{ datasetHandoff.captionedCount }} 张已标注 · {{ datasetHandoff.missingCaptionCount }} 张缺少 caption · {{ datasetHandoff.invalidCount }} 张异常</span><router-link to="/gallery">返回图库检查</router-link></div>
      <div v-if="error" class="advanced-error">{{ error }}</div>
      <div v-for="notice in notices" :key="notice" class="advanced-notice">{{ notice }}</div>

      <div class="advanced-layout">
        <div class="advanced-sections">
          <details v-for="group in groupedFields" :key="group.title" class="advanced-section" open>
            <summary><strong>{{ group.title }}</strong><span>{{ group.fields.length }} 项</span></summary>
            <div class="advanced-fields">
              <label v-for="field in group.fields" :key="field.key" class="advanced-field" :class="{ 'advanced-field--wide': field.schema.meta?.role?.name === 'textarea' }">
                <span>{{ field.schema.meta?.description || field.key }}<code>{{ field.key }}</code></span>
                <input v-if="field.schema.type === 'boolean'" v-model="draft[field.key]" type="checkbox" :disabled="field.schema.meta?.disabled" />
                <select v-else-if="field.schema.type === 'select'" v-model="draft[field.key]" :disabled="field.schema.meta?.disabled"><option v-for="option in field.schema.options" :key="String(option)" :value="option">{{ option }}</option></select>
                <textarea v-else-if="field.schema.type === 'array' || field.schema.meta?.role?.name === 'textarea'" :value="Array.isArray(draft[field.key]) ? draft[field.key].join('\n') : draft[field.key]" rows="3" @input="draft[field.key] = field.schema.type === 'array' ? ($event.target as HTMLTextAreaElement).value.split(/\r?\n|,/).map(v => v.trim()).filter(Boolean) : ($event.target as HTMLTextAreaElement).value"></textarea>
                <div v-else-if="field.schema.meta?.role?.name === 'filepicker'" class="advanced-path"><input v-model="draft[field.key]" type="text" :disabled="field.schema.meta?.disabled" /><button type="button" @click="pickPath(field)">选择</button></div>
                <input v-else-if="field.schema.type === 'number'" v-model.number="draft[field.key]" type="number" :min="field.schema.meta?.min" :max="field.schema.meta?.max" :step="field.schema.meta?.step || 'any'" :disabled="field.schema.meta?.disabled" />
                <input v-else v-model="draft[field.key]" type="text" :disabled="field.schema.meta?.disabled || field.schema.type === 'const'" />
              </label>
            </div>
          </details>
        </div>
        <aside class="advanced-preview"><header>最终提交配置 <span>{{ Object.keys(draft).length }} 项</span></header><pre>{{ JSON.stringify(draft, null, 2) }}</pre><button class="advanced-submit" :disabled="submitting || unsupported.length > 0" @click="submitAdvancedTraining">{{ submitting ? '预检并提交中…' : '预检并开始训练' }}</button></aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.advanced-workbench{display:grid;gap:12px}.advanced-state{min-height:280px;display:grid;place-content:center;gap:8px;text-align:center;color:var(--text-tertiary)}.advanced-state strong{color:var(--text-primary);font-size:18px}.advanced-state button,.advanced-state a{justify-self:center}.advanced-toolbar{display:flex;align-items:end;gap:8px;padding:10px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-elevated)}.advanced-toolbar label{display:grid;gap:5px;color:var(--text-tertiary);font-size:10px}.advanced-toolbar select,.advanced-toolbar button,.advanced-toolbar>button{height:34px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input);color:var(--text-primary);padding:0 10px}.advanced-toolbar__spacer{flex:1}.advanced-warning,.advanced-error,.advanced-notice{display:grid;gap:4px;padding:10px 12px;border-radius:9px;font-size:11px}.advanced-warning{border:1px solid rgba(245,158,11,.3);background:rgba(245,158,11,.08);color:#fbbf24}.advanced-error{border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#fca5a5}.advanced-notice{background:rgba(59,130,246,.08);color:#93c5fd}.advanced-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px;align-items:start}.advanced-sections{display:grid;gap:8px}.advanced-section{border:1px solid var(--border-color);border-radius:11px;background:var(--bg-elevated);overflow:hidden}.advanced-section summary{display:flex;justify-content:space-between;padding:12px;cursor:pointer}.advanced-section summary span{color:var(--text-tertiary);font-size:10px}.advanced-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 12px 14px}.advanced-field{display:grid;align-content:start;gap:5px;color:var(--text-secondary);font-size:11px}.advanced-field--wide{grid-column:1/-1}.advanced-field>span{display:flex;justify-content:space-between;gap:8px}.advanced-field code{color:var(--text-tertiary);font-size:8px}.advanced-field input:not([type=checkbox]),.advanced-field select,.advanced-field textarea{box-sizing:border-box;width:100%;border:1px solid var(--border-color);border-radius:7px;background:var(--bg-input);color:var(--text-primary);padding:8px;font:inherit}.advanced-field input[type=checkbox]{width:18px;height:18px}.advanced-path{display:flex;gap:5px}.advanced-path button{border:1px solid var(--border-color);border-radius:7px;background:var(--bg-input);color:var(--text-secondary)}.advanced-preview{position:sticky;top:10px;border:1px solid var(--border-color);border-radius:11px;background:#111016;overflow:hidden}.advanced-preview header{display:flex;justify-content:space-between;padding:11px;color:var(--text-secondary);font-size:11px}.advanced-preview pre{height:54vh;margin:0;padding:12px;overflow:auto;border-block:1px solid var(--border-color);color:#b8c1ec;font-size:9px;line-height:1.55}.advanced-submit{width:calc(100% - 20px);height:38px;margin:10px;border:0;border-radius:8px;background:var(--accent-primary);color:white;font-weight:700}.advanced-submit:disabled{opacity:.45}@media(max-width:1000px){.advanced-layout{grid-template-columns:1fr}.advanced-preview{position:static}.advanced-fields{grid-template-columns:1fr}.advanced-field--wide{grid-column:auto}}
.advanced-dataset-health{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(34,197,94,.22);border-radius:9px;background:rgba(34,197,94,.06);font-size:10px}.advanced-dataset-health span{color:var(--text-tertiary)}.advanced-dataset-health a{margin-left:auto;color:var(--accent-primary)}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useReverseStore } from '@/stores/reverse'
import { playSuccess } from '@/composables/useSound'

const route = useRoute()
const appStore = useAppStore()
const reverse = useReverseStore()
const {
  imagePath, imageBase64, imageMime, engineMode, modelPath, threshold,
  tags, naturalText, drawingPrompt, isProcessing, lastError,
} = storeToRefs(reverse)

const models = ref<ModelInfo[]>([])
const isDragover = ref(false)
const tagFilter = ref('')
const copiedField = ref('')
const newTag = ref('')
const galleryImageId = ref<number | null>(null)

const imagePreview = computed(() => imageBase64.value
  ? `data:${imageMime.value};base64,${imageBase64.value}`
  : '')
const fileName = computed(() => imagePath.value.split(/[\\/]/).pop() || '')
const filteredTags = computed(() => {
  const query = tagFilter.value.trim().toLowerCase()
  return query ? tags.value.filter(tag => tag.toLowerCase().includes(query)) : tags.value
})
const needsLocal = computed(() => engineMode.value === 'local' || engineMode.value === 'dual')
const needsCloud = computed(() => engineMode.value === 'cloud' || engineMode.value === 'dual')
const canRun = computed(() =>
  !!imageBase64.value &&
  !!imagePath.value &&
  !isProcessing.value &&
  (!needsLocal.value || !!modelPath.value)
)

async function loadImagePath(selectedPath: string) {
  const result = await window.fsAPI?.readImageBase64(selectedPath)
  if (!result?.success || !result.base64) {
    lastError.value = result?.error || '无法读取图片'
    return
  }
  imagePath.value = selectedPath
  imageBase64.value = result.base64
  imageMime.value = result.mime || 'image/jpeg'
  lastError.value = ''
}

async function selectFile() {
  const selected = await window.fsAPI?.selectImages()
  if (selected?.[0]) await loadImagePath(selected[0])
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  isDragover.value = true
}

function onDragLeave() {
  isDragover.value = false
}

async function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragover.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const selectedPath = window.galleryAPI?.getFilePath(file)
  if (selectedPath) await loadImagePath(selectedPath)
}

function normalizeLocalTags(input: any[]): string[] {
  return input
    .map(item => typeof item === 'string' ? item : item?.tag)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

async function runLocal() {
  const model = models.value.find(item => item.path === modelPath.value)
  if (!model) throw new Error('请先选择本地标签模型')
  const result = await window.taggerV2API?.inferSingle({
    modelPath: model.path,
    csvPath: model.csvPath || undefined,
    imagePath: imagePath.value,
    threshold: threshold.value,
    resolution: model.resolution,
  })
  if (!result?.success) throw new Error(result?.error || '本地反推失败')
  return normalizeLocalTags(result.data?.tags || [])
}

async function runCloud() {
  const config = await window.llmAPI?.getConfig()
  if (!config?.apiKey) throw new Error('云端 API 尚未配置，请先到设置页填写')
  const result = await window.llmAPI?.tagImage({
    imageBase64: imageBase64.value,
    threshold: threshold.value,
    outputFormat: 'both',
  })
  if (!result?.success) throw new Error(result?.error || '云端反推失败')
  const description = (result.natural || '').trim()
  return {
    tags: Array.isArray(result.tags) ? result.tags : [],
    naturalText: description,
    drawingPrompt: description,
  }
}

async function runReverse() {
  if (!canRun.value) return
  isProcessing.value = true
  lastError.value = ''
  appStore.setStatus('正在分析图片…')
  try {
    const [localResult, cloudResult] = await Promise.all([
      needsLocal.value ? runLocal() : Promise.resolve([]),
      needsCloud.value ? runCloud() : Promise.resolve({ tags: [], naturalText: '', drawingPrompt: '' }),
    ])
    const mergedTags = [...new Set([...localResult, ...cloudResult.tags])]
    reverse.setResult({
      tags: mergedTags,
      naturalText: cloudResult.naturalText,
      drawingPrompt: cloudResult.drawingPrompt,
    })
    reverse.persist()
    appStore.setStatus(`反推完成：${mergedTags.length} 个标签`)
    playSuccess()
  } catch (error: any) {
    lastError.value = error.message || '反推失败'
    appStore.setStatus('反推失败')
  } finally {
    isProcessing.value = false
  }
}

function removeTag(tag: string) {
  tags.value = tags.value.filter(item => item !== tag)
  reverse.persist()
}

function addTag() {
  const value = newTag.value.trim()
  if (!value || tags.value.includes(value)) return
  tags.value.push(value)
  newTag.value = ''
  reverse.persist()
}

async function copyField(field: 'tags' | 'natural' | 'prompt') {
  const value = field === 'tags' ? tags.value.join(', ')
    : field === 'natural' ? naturalText.value
      : drawingPrompt.value
  await navigator.clipboard.writeText(value)
  copiedField.value = field
  setTimeout(() => { copiedField.value = '' }, 1500)
}

async function saveText() {
  if (!imagePath.value) return
  const text = drawingPrompt.value || naturalText.value || tags.value.join(', ')
  const txtPath = imagePath.value.replace(/\.[^.\\/]+$/, '') + '.txt'
  const result = await window.fsAPI?.saveCaption({ txtPath, caption: text })
  appStore.setStatus(result?.success ? `已保存：${txtPath}` : `保存失败：${result?.error || '未知错误'}`)
}

async function writeBackToGallery() {
  if (!galleryImageId.value || !window.galleryAPI) return
  const result = await window.galleryAPI.setImageTags(
    galleryImageId.value,
    tags.value.map(tag => ({ tag, category: 'general', source: 'reverse' }))
  )
  appStore.setStatus(result.success ? '标签已写回图库' : `写回失败：${result.error || '未知错误'}`)
}

function clearAll() {
  reverse.clear()
  galleryImageId.value = null
}

onMounted(async () => {
  reverse.restore()
  const modelResult = await window.taggerV2API?.listModels()
  if (modelResult?.success && modelResult.data) {
    models.value = modelResult.data.models
    if (!modelPath.value && models.value[0]) modelPath.value = models.value[0].path
  }

  const queryPath = typeof route.query.imagePath === 'string' ? route.query.imagePath : ''
  const queryId = Number(route.query.imageId)
  if (Number.isFinite(queryId) && queryId > 0) galleryImageId.value = queryId
  if (queryPath) await loadImagePath(queryPath)
  else if (imagePath.value && !imageBase64.value) await loadImagePath(imagePath.value)
})
</script>

<template>
  <div class="reverse-workbench">
    <header class="reverse-header">
      <div>
        <p class="eyebrow">PROMPT REVERSE</p>
        <h1>提示词反推</h1>
        <p>本地模型负责稳定标签，云端模型负责自然描述与绘图提示词。</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="clearAll">清空</button>
        <button class="btn btn-primary" :disabled="!canRun" @click="runReverse">
          {{ isProcessing ? '分析中…' : '开始反推' }}
        </button>
      </div>
    </header>

    <div class="reverse-grid">
      <section class="source-column">
        <div class="panel upload-panel">
          <div
            class="drop-zone"
            :class="{ active: isDragover, loaded: imagePreview }"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
            @click="selectFile"
          >
            <img v-if="imagePreview" :src="imagePreview" alt="待反推图片" />
            <div v-else class="empty-upload">
              <span>＋</span>
              <strong>选择或拖入一张图片</strong>
              <small>JPEG、PNG、WebP</small>
            </div>
          </div>
          <div v-if="fileName" class="file-row">
            <span :title="imagePath">{{ fileName }}</span>
            <button @click="selectFile">更换</button>
          </div>
        </div>

        <div class="panel settings-panel">
          <label>分析方式</label>
          <div class="mode-switch">
            <button :class="{ active: engineMode === 'local' }" @click="engineMode = 'local'">本地标签</button>
            <button :class="{ active: engineMode === 'cloud' }" @click="engineMode = 'cloud'">云端描述</button>
            <button :class="{ active: engineMode === 'dual' }" @click="engineMode = 'dual'">双引擎</button>
          </div>

          <template v-if="needsLocal">
            <label for="reverse-model">本地模型</label>
            <select id="reverse-model" v-model="modelPath" class="form-input">
              <option value="" disabled>请选择模型</option>
              <option v-for="model in models" :key="model.path" :value="model.path">{{ model.name }}</option>
            </select>
            <div class="threshold-row">
              <label for="reverse-threshold">标签阈值</label>
              <strong>{{ Math.round(threshold * 100) }}%</strong>
            </div>
            <input id="reverse-threshold" v-model.number="threshold" type="range" min="0.05" max="0.95" step="0.05" />
          </template>

          <p v-if="needsCloud" class="setting-note">云端结果会保留完整段落，不再拆成标签。</p>
          <p v-if="lastError" class="error-message">{{ lastError }}</p>
        </div>
      </section>

      <section class="result-column">
        <div class="result-panel">
          <div class="result-title">
            <div><span>01</span><strong>标签</strong><small>{{ tags.length }} 个</small></div>
            <button :disabled="!tags.length" @click="copyField('tags')">{{ copiedField === 'tags' ? '已复制' : '复制' }}</button>
          </div>
          <div class="tag-tools">
            <input v-model="tagFilter" class="form-input" placeholder="筛选标签" />
            <input v-model="newTag" class="form-input" placeholder="补充标签" @keyup.enter="addTag" />
            <button @click="addTag">添加</button>
          </div>
          <div v-if="filteredTags.length" class="tag-list">
            <span v-for="tag in filteredTags" :key="tag">{{ tag }}<button @click="removeTag(tag)">×</button></span>
          </div>
          <p v-else class="empty-result">运行本地或双引擎后，标签会显示在这里。</p>
        </div>

        <div class="result-panel">
          <div class="result-title">
            <div><span>02</span><strong>自然描述</strong></div>
            <button :disabled="!naturalText" @click="copyField('natural')">{{ copiedField === 'natural' ? '已复制' : '复制' }}</button>
          </div>
          <textarea v-model="naturalText" placeholder="云端模型生成的自然语言描述" @change="reverse.persist"></textarea>
        </div>

        <div class="result-panel">
          <div class="result-title">
            <div><span>03</span><strong>绘图提示词</strong></div>
            <button :disabled="!drawingPrompt" @click="copyField('prompt')">{{ copiedField === 'prompt' ? '已复制' : '复制' }}</button>
          </div>
          <textarea v-model="drawingPrompt" placeholder="可继续编辑为绘图提示词" @change="reverse.persist"></textarea>
          <div class="save-actions">
            <button class="btn btn-secondary" :disabled="!imagePath" @click="saveText">保存同名 .txt</button>
            <button v-if="galleryImageId" class="btn btn-secondary" :disabled="!tags.length" @click="writeBackToGallery">写回图库</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.reverse-workbench { max-width: 1180px; margin: 0 auto; padding: 12px 8px 40px; }
.reverse-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
.reverse-header h1 { margin: 2px 0 5px; color: var(--text-primary); font-size: 26px; }
.reverse-header p { margin: 0; color: var(--text-tertiary); font-size: 13px; }
.eyebrow { color: var(--accent-primary) !important; font: 700 10px var(--font-mono); letter-spacing: .16em; }
.header-actions, .save-actions { display: flex; gap: 8px; }
.reverse-grid { display: grid; grid-template-columns: minmax(300px, .82fr) minmax(480px, 1.35fr); gap: 16px; align-items: start; }
.source-column, .result-column { display: flex; flex-direction: column; gap: 12px; }
.panel, .result-panel { background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: var(--radius-md); }
.upload-panel, .settings-panel { padding: 14px; }
.drop-zone { min-height: 330px; display: grid; place-items: center; overflow: hidden; cursor: pointer; border: 1px dashed var(--border-default); border-radius: var(--radius-sm); background: var(--bg-sunken); }
.drop-zone.active { border-color: var(--accent-primary); background: var(--accent-bg); }
.drop-zone img { width: 100%; height: 330px; object-fit: contain; }
.empty-upload { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-tertiary); }
.empty-upload span { font-size: 36px; color: var(--accent-primary); }
.empty-upload strong { color: var(--text-secondary); }
.file-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 10px; font-size: 12px; color: var(--text-secondary); }
.file-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-row button, .result-title button, .tag-tools button { border: 0; background: transparent; color: var(--accent-primary); cursor: pointer; }
.settings-panel > label { display: block; margin: 8px 0 6px; font-size: 11px; color: var(--text-tertiary); font-weight: 600; }
.mode-switch { display: grid; grid-template-columns: repeat(3, 1fr); padding: 3px; background: var(--bg-sunken); border-radius: var(--radius-sm); }
.mode-switch button { padding: 8px 4px; border: 0; border-radius: 6px; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.mode-switch button.active { background: var(--accent-bg); color: var(--accent-primary); }
.threshold-row { display: flex; justify-content: space-between; margin-top: 12px; color: var(--text-tertiary); font-size: 11px; }
.threshold-row strong { color: var(--accent-primary); }
.settings-panel input[type="range"] { width: 100%; }
.setting-note, .error-message { margin: 12px 0 0; font-size: 11px; line-height: 1.6; color: var(--text-tertiary); }
.error-message { color: var(--accent-danger); }
.result-panel { padding: 16px; }
.result-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.result-title > div { display: flex; align-items: center; gap: 9px; }
.result-title span { color: var(--accent-primary); font: 700 10px var(--font-mono); }
.result-title strong { color: var(--text-primary); font-size: 13px; }
.result-title small { color: var(--text-tertiary); }
.result-title button:disabled { opacity: .35; cursor: default; }
.tag-tools { display: grid; grid-template-columns: 1fr 1fr auto; gap: 7px; margin-bottom: 10px; }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; min-height: 52px; }
.tag-list > span { display: inline-flex; gap: 5px; align-items: center; padding: 5px 9px 5px 11px; border-radius: 999px; background: var(--accent-bg); border: 1px solid var(--border-accent); color: var(--text-secondary); font-size: 11px; }
.tag-list button { border: 0; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.empty-result { min-height: 46px; margin: 0; display: grid; place-items: center; color: var(--text-tertiary); font-size: 12px; }
textarea { width: 100%; min-height: 112px; resize: vertical; box-sizing: border-box; padding: 11px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-sunken); color: var(--text-primary); font: 12px/1.65 var(--font-sans); }
textarea:focus { outline: none; border-color: var(--border-accent); }
.save-actions { justify-content: flex-end; margin-top: 10px; }
@media (max-width: 900px) {
  .reverse-grid { grid-template-columns: 1fr; }
  .reverse-header { align-items: flex-start; flex-direction: column; }
  .header-actions { width: 100%; }
  .header-actions .btn { flex: 1; }
}
</style>

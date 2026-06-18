<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useTaggerStore } from '@/stores/tagger'
import { useAppStore } from '@/stores/app'
import { useLogStore } from '@/stores/logs'
import { usePipelineStore } from '@/stores/pipeline'
import { useGalleryStore } from '@/stores/gallery'
import { playSuccess } from '@/composables/useSound'

const taggerStore = useTaggerStore()
const appStore = useAppStore()
const logStore = useLogStore()
const pipelineStore = usePipelineStore()
const galleryStore = useGalleryStore()

// Output format
const outputFormat = ref<'danbooru' | 'natural' | 'both'>('danbooru')

// ── Mode ──
const mode = ref<'single' | 'batch'>('single')

// ── Single mode state ──
const isDragover = ref(false)
const imageBase64 = ref<string | null>(null)
const imagePreview = ref<string | null>(null)

// ── Batch mode state ──
const folderPath = ref('')
const imageFiles = ref<{ name: string; path: string }[]>([])
const batchResults = ref<Map<string, { tags: { tag: string; confidence: number }[]; error?: string; done: boolean }>>(new Map())
const batchProgress = ref({ current: 0, total: 0 })
const startTime = ref(0)
const logStream = ref<HTMLElement | null>(null)
const localModelDir = ref('')

// ── Batch tag browsing/editing ──
const batchSelectedPath = ref<string | null>(null)
const batchPreviewB64 = ref<string | null>(null)
const editTagIdx = ref(-1)
const editTagText = ref('')
const addNewFlag = ref(false)
const newTagInput = ref('')
const localModels = ref<{ name: string; path: string; hasCsv: boolean }[]>([])
const selectedLocalModel = ref('')

async function loadLocalModelPath() {
  if (!window.llmAPI) return
  const c = await window.llmAPI.getConfig()
  localModelDir.value = c.localModelDir || ''
  selectedLocalModel.value = c.localModel || ''
  if (localModelDir.value) await scanModels()
}

// ── Gallery import detection ──
async function checkGalleryImport() {
  if (!taggerStore.fromGallery || taggerStore.pendingImages.length === 0) return
  const images = taggerStore.pendingImages
  mode.value = 'batch'
  folderPath.value = '📦 从图库导入'
  imageFiles.value = images.map((img) => ({
    name: img.filename,
    path: img.path,
  }))
  batchResults.value.clear()
  appStore.setStatus(`从图库导入 ${images.length} 张图片`)
  logStore.info(`从图库导入 ${images.length} 张图片，切换到批处理模式`)
}

onMounted(() => {
  checkGalleryImport()
})
async function selectLocalModelDir() {
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (!folder) return
  localModelDir.value = folder
  if (window.llmAPI) await window.llmAPI.saveConfig({ localModelDir: folder })
  await scanModels()
}
async function scanModels() {
  if (!window.fsAPI || !localModelDir.value) return
  const res = await window.fsAPI.scanModels(localModelDir.value)
  if (res.success) {
    localModels.value = res.models || []
    if (localModels.value.length > 0 && !localModels.value.find(m => m.name === selectedLocalModel.value)) {
      selectedLocalModel.value = localModels.value[0].name
    }
    if (window.llmAPI) await window.llmAPI.saveConfig({ localModelDir: localModelDir.value, localModel: selectedLocalModel.value })
  }
}

// Auto-scroll log stream
watch(() => batchResults.value.size, async () => {
  await nextTick()
  if (logStream.value) logStream.value.scrollTop = logStream.value.scrollHeight
})

const progressPercent = computed(() => {
  if (batchProgress.value.total === 0) return 0
  return Math.round((batchProgress.value.current / batchProgress.value.total) * 100)
})

// ── Single: drag & drop ──
function onDragOver(e: DragEvent) { e.preventDefault(); isDragover.value = true }
function onDragLeave() { isDragover.value = false }

async function loadFile(file: File) {
  taggerStore.selectedFile = file.name
  appStore.setStatus(`已加载: ${file.name}`)
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    imagePreview.value = dataUrl
    imageBase64.value = dataUrl.split(',')[1] || ''
  }
  reader.readAsDataURL(file)
}

function onDrop(e: DragEvent) {
  e.preventDefault(); isDragover.value = false
  if (e.dataTransfer?.files.length) loadFile(e.dataTransfer.files[0])
}

function selectFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/webp'
  input.onchange = () => { if (input.files?.length) loadFile(input.files[0]) }
  input.click()
}

// ── Batch: folder ──
async function selectFolder() {
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (!folder) return
  folderPath.value = folder
  const files = await window.fsAPI.listImages(folder)
  imageFiles.value = files
  batchResults.value.clear()
  appStore.setStatus(`已加载 ${files.length} 张图片`)
}

async function runBatchTagging() {
  if (!window.fsAPI || !window.llmAPI) return
  const files = imageFiles.value.filter((f) => !batchResults.value.get(f.path)?.done)
  if (files.length === 0) return

  batchProgress.value = { current: 0, total: files.length }
  startTime.value = Date.now()
  appStore.setStatus('批量标注中...')
  pipelineStore.startTask(folderPath.value.split(/[/\\]/).pop() || '批量标注')

  for (const file of files) {
    batchResults.value.set(file.path, { tags: [], done: false })
    try {
      let tagList: string[] = []

      if (taggerStore.tagSource === 'local') {
        // ── LOCAL ONNX inference ──
        if (!window.taggerAPI) throw new Error('本地推理不可用')
        if (!localModelDir.value) throw new Error('请先选择本地模型目录')
        const res = await window.taggerAPI.localInfer({
          imagePath: file.path,
          threshold: taggerStore.threshold,
        })
        if (res.success) {
          tagList = res.tags || []
        } else {
          throw new Error(res.error || '本地推理失败')
        }
      } else {
        // ── Cloud API ──
        const imgResult = await window.fsAPI.readImageBase64(file.path)
        if (!imgResult.success) throw new Error(imgResult.error)
        const res = await window.llmAPI.tagImage({
          imageBase64: imgResult.base64,
          mimeType: imgResult.mime || 'image/jpeg',
          outputFormat: outputFormat.value,
        })
        if (res.success) {
          tagList = (res.tags || []).slice()
          if (tagList.length === 0 && res.natural) {
            tagList = res.natural.split(/[,，\n]+/).map((t: string) => t.trim()).filter((t: string) => t.length > 0)
          }
        } else {
          throw new Error(res.error || 'API 失败')
        }
        // Rate-limit delay for cloud API
        await new Promise((r) => setTimeout(r, 1500))
      }

      const tags = tagList.map((tag: string, i: number) => ({
        tag,
        confidence: Math.max(0.99 - i * 0.01, 0.5),
      }))
      batchResults.value.set(file.path, { tags, done: true })
    } catch (e: any) {
      batchResults.value.set(file.path, { tags: [], error: e.message, done: true })
    }
    batchProgress.value.current++
    // Update pipeline
    const pct = Math.round((batchProgress.value.current / batchProgress.value.total) * 100)
    const done = batchProgress.value.current
    const total = batchProgress.value.total
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    const speed = (done / Math.max(1, parseFloat(elapsed))).toFixed(1)
    const remaining = Math.max(0, Math.round((total - done) / Math.max(0.01, parseFloat(speed))))
    pipelineStore.updateProgress(pct, remaining + 's', speed + ' it/s')
  }

  // ── Save .txt files + create .已标 folder ──
  let savedCount = 0
  const taggedDir = folderPath.value + '.已标'

  for (const [filePath, result] of batchResults.value.entries()) {
    if (!result.done || result.error) continue
    let caption = result.tags.map((t) => t.tag).join(', ')
    // Fallback: if tags are empty, don't write an empty file
    if (!caption.trim()) {
      console.log('[Tagger] 跳过空标签:', filePath)
      continue
    }
    const base = filePath.replace(/\.[^.]+$/, '')
    const txtPath = base + '.txt'

    try {
      const saveRes = await window.fsAPI.saveCaption({ txtPath, caption })
      if (saveRes.success) {
        savedCount++
        console.log('[Tagger] 已保存:', txtPath)
      } else {
        console.error('[Tagger] 保存失败:', txtPath, saveRes.error)
      }
    } catch (e: any) {
      console.error('[Tagger] 保存异常:', txtPath, e.message)
    }

    // Copy image to .已标 folder (no txt)
    try {
      const ext = filePath.split('.').pop() || 'png'
      const name = filePath.split(/[/\\]/).pop() || 'image.' + ext
      await window.fsAPI.copyFile({ src: filePath, dest: taggedDir + '/' + name, destDir: taggedDir })
    } catch (e: any) {
      console.error('[Tagger] 复制失败:', filePath, e.message)
    }
  }

  const doneCount = [...batchResults.value.values()].filter((r) => r.done && !r.error).length
  appStore.setStatus(`批量完成 · ${doneCount}/${files.length} 张成功 · 已保存 ${savedCount} 个标注`)
  logStore.success(`已标数据保存至: ${taggedDir} (${savedCount} 个文件)`)

  // Write tags back to gallery DB if imported from gallery
  if (taggerStore.fromGallery && window.galleryAPI) {
    const entries = []
    for (const [filePath, result] of batchResults.value.entries()) {
      if (!result.done || result.error) continue
      const img = taggerStore.pendingImages.find((pi) => pi.path === filePath)
      if (!img) continue
      entries.push({
        imageId: img.id,
        tags: result.tags.map((t) => ({
          tag: t.tag,
          confidence: t.confidence,
          source: taggerStore.tagSource,
        })),
      })
    }
    if (entries.length > 0) {
      const tagRes = await window.galleryAPI.batchSetTags(entries)
      if (tagRes.success) {
        logStore.success(`已将 ${tagRes.data?.updated || entries.length} 张图片的标签写入图库`)
        // Clear gallery tag cache so it refreshes on next visit
        for (const e of entries) {
          galleryStore.imageTags.delete(e.imageId)
        }
      }
    }
  }

  pipelineStore.finishTask()
  playSuccess()
  taggerStore.clearImport()
}

// ── Batch tag browsing & editing ──
function selectedBatchResult() {
  if (!batchSelectedPath.value) return null
  return batchResults.value.get(batchSelectedPath.value) || null
}

function selectedBatchTags() {
  return selectedBatchResult()?.tags || []
}

async function selectBatchFile(filePath: string) {
  batchSelectedPath.value = filePath
  batchPreviewB64.value = null
  if (window.fsAPI) {
    const res = await window.fsAPI.readThumb(filePath)
    if (res.success && res.base64) {
      batchPreviewB64.value = `data:image/jpeg;base64,${res.base64}`
    }
  }
}

function startEditBatchTag(index: number, text: string) {
  editTagIdx.value = index
  editTagText.value = text
}

function saveEditBatchTag() {
  const text = editTagText.value.trim()
  if (!text || !batchSelectedPath.value) { cancelEditBatchTag(); return }
  const result = batchResults.value.get(batchSelectedPath.value)
  if (!result) return
  const tags = [...result.tags]
  if (editTagIdx.value >= 0 && editTagIdx.value < tags.length) {
    tags[editTagIdx.value] = { ...tags[editTagIdx.value], tag: text }
  }
  batchResults.value.set(batchSelectedPath.value, { ...result, tags })
  cancelEditBatchTag()
}

function deleteBatchTag(index: number) {
  if (!batchSelectedPath.value) return
  const result = batchResults.value.get(batchSelectedPath.value)
  if (!result) return
  const tags = result.tags.filter((_, i) => i !== index)
  batchResults.value.set(batchSelectedPath.value, { ...result, tags })
}

function cancelEditBatchTag() { editTagIdx.value = -1; editTagText.value = '' }

function startAddBatchTag() { addNewFlag.value = true; newTagInput.value = '' }
function confirmAddBatchTag() {
  const text = newTagInput.value.trim()
  if (!text || !batchSelectedPath.value) { cancelAddBatchTag(); return }
  const result = batchResults.value.get(batchSelectedPath.value)
  if (!result) return
  const tags = [...result.tags, { tag: text, confidence: 1 }]
  batchResults.value.set(batchSelectedPath.value, { ...result, tags })
  cancelAddBatchTag()
}
function cancelAddBatchTag() { addNewFlag.value = false; newTagInput.value = '' }

async function saveSelectedCaptionFile() {
  if (!batchSelectedPath.value || !window.fsAPI) return
  const tags = selectedBatchTags()
  if (tags.length === 0) return
  const caption = tags.map((t) => t.tag).join(', ')
  const base = batchSelectedPath.value.replace(/\.[^.]+$/, '')
  const txtPath = base + '.txt'
  const res = await window.fsAPI.saveCaption({ txtPath, caption })
  if (res.success) {
    appStore.setStatus('标注文件已保存: ' + txtPath.split(/[/\\]/).pop())
  }
}

async function saveAllCaptionFiles() {
  if (!window.fsAPI) return
  let count = 0
  for (const [filePath, result] of batchResults.value.entries()) {
    if (!result.done || result.error) continue
    const caption = result.tags.map((t) => t.tag).join(', ')
    if (!caption) continue
    const base = filePath.replace(/\.[^.]+$/, '')
    const txtPath = base + '.txt'
    const res = await window.fsAPI.saveCaption({ txtPath, caption })
    if (res.success) count++
  }
  appStore.setStatus(`已保存 ${count} 个标注文件`)
}

// ── Single tagging ──
async function handleRunTagging() {
  if (mode.value === 'batch') {
    await runBatchTagging()
    return
  }
  appStore.setStatus('标注中...')
  await taggerStore.runTagging(imageBase64.value || undefined)
  if (taggerStore.lastError) {
    appStore.setStatus('标注失败: ' + taggerStore.lastError)
  } else {
    // Save .txt alongside original if it's a file
    if (taggerStore.selectedFile && taggerStore.results.length > 0) {
      const tags = taggerStore.results.map((t) => t.tag).join(', ')
      const base = taggerStore.selectedFile.replace(/\.[^.]+$/, '')
      // Can't save directly for drag-drop files in browser, but log it
      logStore.info(`标注结果 (${taggerStore.results.length} 个标签): ${tags.slice(0, 200)}...`)
    }
    appStore.setStatus(`标注完成 · ${taggerStore.results.length} 个标签`)
    playSuccess()
  }
}

function handleClear() {
  taggerStore.clearResults()
  taggerStore.clearImport()
  imageBase64.value = null
  imagePreview.value = null
  folderPath.value = ''
  imageFiles.value = []
  batchResults.value.clear()
  batchProgress.value = { current: 0, total: 0 }
  batchSelectedPath.value = null
  batchPreviewB64.value = null
  editTagIdx.value = -1
  addNewFlag.value = false
  appStore.setStatus('就绪')
}

function formatPercent(val: number): string { return (val * 100).toFixed(1) + '%' }
function confidenceClass(val: number): string {
  if (val >= 0.7) return 'high'
  if (val >= 0.35) return 'mid'
  return 'low'
}
</script>

<template>
  <div class="tagger-page">
    <div class="page-header">
      <h1 class="page-title">图像标注</h1>
      <p class="page-desc">AI 模型自动识别动漫图像标签与特征</p>
    </div>

    <!-- Gallery import banner -->
    <div v-if="taggerStore.fromGallery && taggerStore.pendingImages.length > 0" class="gallery-import-banner">
      <span>📦 从图库导入 {{ taggerStore.pendingImages.length }} 张图片</span>
      <button class="chip" @click="taggerStore.clearImport(); handleClear()">清除</button>
    </div>

    <div class="tagger-layout">
      <!-- Left Panel -->
      <div class="panel glass-panel">
        <h3 class="panel-title">输入图像</h3>

        <!-- Mode toggle -->
        <div class="config-group">
          <label class="form-label">标注模式</label>
          <div class="source-tabs">
            <button class="source-tab" :class="{ active: mode === 'single' }" @click="mode = 'single'">🖼 单张</button>
            <button class="source-tab" :class="{ active: mode === 'batch' }" @click="mode = 'batch'">📂 批量</button>
          </div>
        </div>

        <!-- SINGLE MODE -->
        <template v-if="mode === 'single'">
          <div
            class="drop-zone"
            :class="{ dragover: isDragover, hasFile: taggerStore.selectedFile }"
            @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @click="selectFile"
          >
            <template v-if="!imagePreview">
              <div class="drop-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                </svg>
              </div>
              <p class="drop-text">拖拽图像到此处</p>
              <p class="drop-hint">或点击选择 · JPG / PNG / WEBP</p>
            </template>
            <template v-else>
              <img :src="imagePreview" class="preview-img" />
              <p class="drop-text selected">{{ taggerStore.selectedFile }}</p>
              <p class="drop-hint">点击更换图像</p>
            </template>
          </div>
        </template>

        <!-- BATCH MODE -->
        <template v-if="mode === 'batch'">
          <div class="folder-picker" @click="selectFolder">
            <div class="folder-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </div>
            <template v-if="!folderPath">
              <p class="drop-text">点击选择文件夹</p>
              <p class="drop-hint">将标注文件夹内所有图片</p>
            </template>
            <template v-else>
              <p class="drop-text selected">{{ folderPath }}</p>
              <p class="drop-hint">{{ imageFiles.length }} 张图片</p>
            </template>
          </div>

          <!-- File list -->
          <div class="file-list" v-if="imageFiles.length > 0">
            <div
              v-for="file in imageFiles"
              :key="file.path"
              class="file-item"
              :class="{
                done: batchResults.get(file.path)?.done && !batchResults.get(file.path)?.error,
                error: batchResults.get(file.path)?.error,
              }"
            >
              <span class="file-status">
                <span v-if="!batchResults.has(file.path)">⏳</span>
                <span v-else-if="!batchResults.get(file.path)?.done">🔄</span>
                <span v-else-if="batchResults.get(file.path)?.error">❌</span>
                <span v-else>✅</span>
              </span>
              <span class="file-name">{{ file.name }}</span>
              <span class="file-tags" v-if="batchResults.get(file.path)?.done && !batchResults.get(file.path)?.error">
                {{ batchResults.get(file.path)?.tags.slice(0, 3).map(t => t.tag).join(', ') }}
              </span>
            </div>
          </div>

          <!-- Progress -->
          <div class="progress-bar" v-if="batchProgress.total > 0">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            <span class="progress-text">{{ batchProgress.current }}/{{ batchProgress.total }}</span>
          </div>
        </template>

        <!-- Tag source -->
        <div class="config-group">
          <label class="form-label">标注来源</label>
          <div class="source-tabs">
            <button class="source-tab" :class="{ active: taggerStore.tagSource === 'llm' }" @click="taggerStore.tagSource = 'llm'">🤖 LLM</button>
            <button class="source-tab" :class="{ active: taggerStore.tagSource === 'local' }" @click="taggerStore.tagSource = 'local'">📦 本地模型</button>
          </div>
        </div>

        <!-- Local model path -->
        <div class="config-group local-path-cabin" v-if="taggerStore.tagSource === 'local'">
          <label class="form-label">📂 本地模型目录</label>
          <div class="path-input-row">
            <input type="text" :value="localModelDir" placeholder="未选择 ONNX 模型目录..." readonly />
            <button class="chip" @click="selectLocalModelDir">选择</button>
          </div>
          <span class="cfg-hint" v-if="!localModelDir" style="color:#f87171;">未检测到推理目录，请选择包含 .onnx 与 .csv 的文件夹</span>

          <!-- Model selector -->
          <div v-if="localModels.length > 0" style="margin-top: 10px;">
            <label class="form-label">🧠 可用模型</label>
            <select class="form-select" v-model="selectedLocalModel" style="width:100%;">
              <option v-for="m in localModels" :key="m.name" :value="m.name">
                {{ m.name }} {{ m.hasCsv ? '✅' : '⚠️ 无CSV' }}
              </option>
            </select>
          </div>
          <span class="cfg-hint" v-if="localModelDir && localModels.length === 0" style="color:#fbbf24;">该目录未检测到 .onnx 模型文件</span>
        </div>

        <div class="config-group" v-if="taggerStore.tagSource === 'llm'">
          <label class="form-label">输出格式</label>
          <div class="source-tabs">
            <button class="source-tab" :class="{ active: outputFormat === 'danbooru' }" @click="outputFormat = 'danbooru'">🏷 标签</button>
            <button class="source-tab" :class="{ active: outputFormat === 'natural' }" @click="outputFormat = 'natural'">📝 自然语言</button>
            <button class="source-tab" :class="{ active: outputFormat === 'both' }" @click="outputFormat = 'both'">📋 两者都要</button>
          </div>
        </div>

        <div class="btn-group">
          <button
            class="action-btn"
            :disabled="(mode === 'single' && !taggerStore.selectedFile) || (mode === 'batch' && imageFiles.length === 0) || taggerStore.isProcessing"
            @click="handleRunTagging"
          >
            <span class="action-btn-icon">
              <svg v-if="taggerStore.isProcessing" class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
              <span v-else>🐾</span>
            </span>
            <span class="action-btn-text">
              {{ taggerStore.isProcessing ? '标注中...' : mode === 'batch' ? `批量标注 ${imageFiles.length} 张` : '开始标注' }}
            </span>
          </button>
          <button class="clear-btn" :disabled="!taggerStore.selectedFile && taggerStore.results.length === 0 && imageFiles.length === 0" @click="handleClear">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><line x1="10" y1="10" x2="10" y2="18"/><line x1="14" y1="10" x2="14" y2="18"/></svg>
            清除
          </button>
        </div>
      </div>

      <!-- Right Panel: Results -->
      <div class="panel panel-results">
        <!-- Decorative background -->
        <div class="results-bg"></div>

        <h3 class="panel-title" style="position: relative; z-index: 1;">
          标注结果
          <span class="source-badge" v-if="taggerStore.results.length > 0 || batchResults.size > 0">
            {{ mode === 'batch' ? '📂 批量' : taggerStore.tagSource === 'llm' ? '🤖 LLM' : '📦 本地' }}
          </span>
        </h3>

        <!-- Error -->
        <div class="error-box" v-if="taggerStore.lastError">
          <span>❌ {{ taggerStore.lastError }}</span>
        </div>

        <!-- SINGLE results -->
        <template v-if="mode === 'single'">
          <div class="results-container" v-if="taggerStore.results.length > 0">
            <div
              v-for="(item, i) in taggerStore.results"
              :key="i"
              class="tag-item bounce-in"
              :style="{ animationDelay: i * 0.04 + 's' }"
              :class="confidenceClass(item.confidence)"
            >
              <span class="tag-rank">#{{ i + 1 }}</span>
              <span class="tag-name">{{ item.tag }}</span>
              <span class="tag-confidence">{{ formatPercent(item.confidence) }}</span>
              <div class="tag-bar"><div class="tag-bar-fill" :style="{ width: item.confidence * 100 + '%' }"></div></div>
            </div>
          </div>
          <div class="empty-state" v-else-if="!taggerStore.lastError">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <p>选择图像并点击「开始标注」</p>
          </div>
        </template>

        <!-- BATCH results: console-style -->
        <template v-if="mode === 'batch'">
          <!-- Progress bar -->
          <div class="batch-progress-bar" v-if="batchProgress.total > 0">
            <div class="batch-progress-fill" :style="{ width: progressPercent + '%' }"></div>
            <div class="batch-progress-info">
              <span>🔄 批量标注中...</span>
              <span class="batch-progress-num">{{ batchProgress.current }} / {{ batchProgress.total }}</span>
            </div>
          </div>

          <!-- Batch: File list + Detail panel -->
          <template v-if="batchResults.size > 0">
            <!-- File list -->
            <div class="batch-log-stream" ref="logStream">
              <div
                v-for="[filePath, result] in [...batchResults.entries()]"
                :key="filePath"
                class="batch-log-line"
                :class="{
                  done: result.done && !result.error,
                  error: result.error,
                  active: !result.done,
                  selected: batchSelectedPath === filePath,
                }"
                @click="result.done && !result.error ? selectBatchFile(filePath) : null"
              >
                <span class="log-status">
                  <span v-if="result.error">❌</span>
                  <span v-else-if="!result.done">▶</span>
                  <span v-else>✓</span>
                </span>
                <span class="log-file">{{ filePath.split(/[/\\]/).pop() }}</span>
                <span class="log-result" v-if="result.done && !result.error">
                  {{ result.tags.length }} 标签
                  <span class="log-tags-preview">{{ result.tags.slice(0, 6).map(t => t.tag).join(', ') }}{{ result.tags.length > 6 ? '...' : '' }}</span>
                </span>
                <span class="log-error-msg" v-if="result.error">{{ result.error }}</span>
                <span class="log-waiting" v-if="!result.done">等待中...</span>
              </div>
            </div>

            <!-- Selected file: preview + editable tags -->
            <div v-if="batchSelectedPath && selectedBatchResult()?.done" class="batch-detail">
              <div class="batch-preview" v-if="batchPreviewB64">
                <img :src="batchPreviewB64" />
              </div>

              <div class="batch-tags-section">
                <div class="batch-tags-label">标签 · 双击编辑</div>
                <div class="batch-tags">
                  <template v-for="(t, i) in selectedBatchTags()" :key="i">
                    <span v-if="editTagIdx === i" class="batch-tag-pill editing">
                      <input v-model="editTagText" class="tag-edit-input"
                        @keydown.enter="saveEditBatchTag()"
                        @keydown.escape="cancelEditBatchTag()"
                        @blur="saveEditBatchTag()" autofocus />
                    </span>
                    <span v-else class="batch-tag-pill" @dblclick="startEditBatchTag(i, t.tag)">
                      {{ t.tag }}
                      <button class="tag-delete-btn" @click.stop="deleteBatchTag(i)">×</button>
                    </span>
                  </template>
                  <span v-if="addNewFlag" class="batch-tag-pill editing add">
                    <input v-model="newTagInput" class="tag-edit-input" placeholder="新标签..."
                      @keydown.enter="confirmAddBatchTag()"
                      @keydown.escape="cancelAddBatchTag()"
                      @blur="confirmAddBatchTag()" autofocus />
                  </span>
                  <button v-else class="batch-tag-pill add-btn" @click="startAddBatchTag">+ 添加</button>
                </div>
              </div>

              <div class="batch-detail-actions">
                <button class="btn btn-primary" style="flex:1;font-size:11px;" @click="saveSelectedCaptionFile()">
                  💾 保存标注文件
                </button>
                <button class="btn btn-secondary" style="font-size:11px;" @click="saveAllCaptionFiles()">
                  全部保存
                </button>
              </div>
            </div>
          </template>

          <div class="empty-state" v-else-if="!taggerStore.lastError">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
            <p>选择文件夹开始批量标注</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══ PAGE WRAPPER: Console Cabin ═══ */
.tagger-page { max-width: 1300px; margin: 0 auto; }
.page-header { margin-bottom: 18px; }

/* ── Gallery import banner ── */
.gallery-import-banner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; margin-bottom: 12px;
  background: rgba(244, 114, 182, 0.08);
  border: 1px solid rgba(244, 114, 182, 0.2);
  border-radius: var(--radius-md);
  font-size: 13px; color: var(--accent-primary); font-weight: 500;
}
.gallery-import-banner .chip {
  padding: 4px 12px; font-size: 11px;
  border: 1px solid rgba(244, 114, 182, 0.25);
  border-radius: var(--radius-full);
  background: transparent; color: var(--accent-primary);
  cursor: pointer; transition: all var(--transition-fast);
}
.gallery-import-banner .chip:hover {
  background: rgba(244, 114, 182, 0.15);
}
.page-title { font-size: 22px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
.page-desc { font-size: 12px; color: var(--text-tertiary); }
.tagger-layout {
  display: grid; grid-template-columns: 340px 1fr; gap: 20px; align-items: start;
  background: rgba(18,18,22,0.4); backdrop-filter: blur(20px);
  border: 1px solid rgba(244,114,182,0.08); border-radius: var(--radius-lg);
  padding: 20px;
}

/* ═══ PANELS ═══ */
.panel { padding: 18px; position: relative; }
.panel-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 14px; letter-spacing: 0.03em; display: flex; align-items: center; gap: 8px; }
.source-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full); background: var(--accent-bg); color: var(--accent-primary); }

/* Left panel: recessed control deck */
.glass-panel:first-child { background: rgba(10,11,14,0.6); border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-md); box-shadow: inset 0 4px 16px rgba(0,0,0,0.4); position: relative; }
.glass-panel:first-child::after { content: '[SYS.CTRL]'; position:absolute; top:8px; right:12px; font-family:var(--font-mono); font-size:9px; color:rgba(244,114,182,0.2); letter-spacing:0.1em; pointer-events:none; }

/* Source tabs: recessed dark */
.config-group { margin-bottom: 14px; }
.source-tabs { display: flex; gap: 6px; }
.source-tab {
  flex: 1; padding: 8px 12px;
  border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-full);
  background: var(--hud-bg); box-shadow: inset 0 2px 6px rgba(0,0,0,0.5);
  color: var(--text-tertiary); font-size: 11px; font-family: var(--font-mono); font-weight: 600;
  cursor: pointer; transition: all 0.25s; letter-spacing: 0.02em;
}
.source-tab:hover { background: var(--hud-bg-lighter); color: var(--text-secondary); }
.source-tab.active { background: rgba(255,0,127,0.08); border-color: rgba(255,0,127,0.3); color: #FF007F; box-shadow: 0 0 12px rgba(255,0,127,0.15); }

.full-width { width: 100%; }
.btn-group { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }

/* Action button: neon with running border when ready */
.action-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; padding: 14px 20px; position: relative;
  border: 1px solid rgba(255,0,127,0.2); border-radius: var(--radius-full);
  background: var(--hud-bg); color: var(--text-secondary);
  font-size: 14px; font-weight: 700; font-family: var(--font-mono);
  cursor: pointer; letter-spacing: 0.05em;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.6);
  transition: all 0.3s; overflow: hidden;
}
.action-btn:not(:disabled) {
  border-color: rgba(255,0,127,0.35);
  animation: border-run 3s linear infinite;
}
@keyframes border-run {
  0% { border-color: rgba(255,0,127,0.2); }
  50% { border-color: rgba(255,0,127,0.6); box-shadow: 0 0 20px rgba(255,0,127,0.15), inset 0 2px 8px rgba(0,0,0,0.6); }
  100% { border-color: rgba(255,0,127,0.2); }
}
.action-btn:not(:disabled):hover {
  background: var(--hud-bg-lighter); color: #FF007F;
  box-shadow: 0 0 30px rgba(255,0,127,0.25), inset 0 2px 8px rgba(0,0,0,0.6);
  transform: scale(1.02);
}
.action-btn:active { transform: scale(0.97); }
.action-btn:disabled { opacity: 0.3; cursor: not-allowed; animation: none; }
.action-btn-icon { font-size: 18px; flex-shrink: 0; line-height: 1; }
.action-btn-text { white-space: nowrap; }

/* Clear button */
.clear-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 10px 16px;
  border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-full);
  background: var(--hud-bg); box-shadow: inset 0 2px 6px rgba(0,0,0,0.5);
  color: var(--text-tertiary); font-size: 12px; font-weight: 500;
  font-family: var(--font-sans); cursor: pointer; transition: all 0.25s;
}
.clear-btn:hover { background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.25); color: #f87171; }
.clear-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* Drop Zone */
.drop-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 36px 20px; border: 2px dashed var(--glass-border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-base); margin-bottom: 18px; background: var(--glass-bg); overflow: hidden; min-height: 160px; }
.drop-zone:hover { border-color: var(--border-accent); background: var(--glass-bg-hover); }
.drop-zone.dragover { border-color: var(--accent-primary); background: var(--accent-bg); box-shadow: var(--accent-glow); }
.drop-zone.hasFile { border-color: rgba(var(--accent-primary-rgb), 0.4); border-style: solid; background: var(--accent-bg); padding: 12px; }
.drop-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); background: var(--glass-bg); color: var(--text-tertiary); margin-bottom: 12px; }
.drop-icon svg { width: 28px; height: 28px; }
.preview-img { max-width: 100%; max-height: 180px; border-radius: var(--radius-sm); object-fit: contain; margin-bottom: 8px; }
.drop-text { font-size: 14px; color: var(--text-secondary); margin-bottom: 4px; font-weight: 500; }
.drop-text.selected { color: var(--accent-primary); word-break: break-all; }
.drop-hint { font-size: 11px; color: var(--text-tertiary); }

/* Folder Picker */
.folder-picker { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; border: 2px dashed var(--glass-border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition-base); margin-bottom: 14px; background: var(--glass-bg); }
.folder-picker:hover { border-color: var(--border-accent); background: var(--glass-bg-hover); }
.folder-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); background: var(--glass-bg); color: var(--text-tertiary); margin-bottom: 10px; }
.folder-icon svg { width: 28px; height: 28px; }

/* File List */
.file-list { max-height: 200px; overflow-y: auto; margin-bottom: 14px; display: flex; flex-direction: column; gap: 2px; }
.file-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: var(--radius-xs); font-size: 12px; background: var(--glass-bg); transition: background var(--transition-fast); }
.file-item:hover { background: var(--glass-bg-hover); }
.file-item.done { background: rgba(52, 211, 153, 0.08); }
.file-item.error { background: rgba(248, 113, 113, 0.08); }
.file-status { flex-shrink: 0; font-size: 12px; }
.file-name { color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-tags { font-size: 11px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }

/* Progress */
.progress-bar { position: relative; height: 22px; background: var(--glass-bg); border-radius: var(--radius-full); overflow: hidden; margin-bottom: 10px; }
.progress-fill { height: 100%; background: var(--gradient-accent); border-radius: var(--radius-full); transition: width 0.3s ease; }
.progress-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #fff; }

/* Error */
.error-box { display: flex; align-items: flex-start; gap: 8px; padding: 12px; margin-bottom: 12px; background: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.25); border-radius: var(--radius-sm); color: #f87171; font-size: 12px; position: relative; z-index: 1; }

/* ── Results Panel: HUD Decoder ── */
.panel-results {
  background: var(--hud-bg);
  border: 1px solid rgba(244,114,182,0.1);
  border-radius: var(--radius-lg);
  overflow: hidden; min-height: 460px; position: relative;
  box-shadow: inset 0 4px 20px rgba(0,0,0,0.8);
}
/* L-bracket corners */
.panel-results::before {
  content: ''; position: absolute; top: 12px; left: 12px; width: 14px; height: 14px;
  border-top: 2px solid rgba(255,0,127,0.4); border-left: 2px solid rgba(255,0,127,0.4);
  pointer-events: none; z-index: 5;
}
.panel-results::after {
  content: '[DECODER: AWAITING_STREAM]';
  position: absolute; top: 12px; right: 16px;
  font-family: var(--font-mono); font-size: 9px;
  color: rgba(255,0,127,0.3); letter-spacing: 0.08em;
  pointer-events: none; z-index: 5;
}
/* Grid lines */
.results-bg {
  position: absolute; inset: 0; pointer-events: none; z-index: 0; opacity: 0.04;
  background-image:
    linear-gradient(rgba(244,114,182,0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(244,114,182,0.15) 1px, transparent 1px);
  background-size: 24px 24px;
}

/* Single results */
.results-container { flex: 1; display: flex; flex-direction: column; gap: 3px; min-height: 200px; position: relative; z-index: 1; }

.tag-item {
  display: grid;
  grid-template-columns: 32px 1fr 50px;
  grid-template-rows: auto auto;
  align-items: center; gap: 2px 8px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  animation-fill-mode: both;
  position: relative; z-index: 1;
}
.tag-item:hover { background: rgba(255,255,255,0.06); }
.tag-rank { font-size: 10px; color: var(--text-tertiary); text-align: center; font-weight: 700; font-family: var(--font-mono); }
.tag-name { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.tag-confidence { font-size: 11px; color: var(--text-tertiary); text-align: right; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
.tag-item.high .tag-name { color: var(--text-primary); }
.tag-item.high .tag-confidence { color: var(--accent-success); }
.tag-item.mid .tag-confidence { color: var(--accent-warning); }
.tag-bar { grid-column: 2 / -1; height: 3px; background: rgba(255,255,255,0.04); border-radius: 2px; overflow: hidden; }
.tag-bar-fill { height: 100%; border-radius: 2px; background: var(--accent-primary); transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
.tag-item.high .tag-bar-fill { background: var(--accent-success); box-shadow: 0 0 8px rgba(52, 211, 153, 0.3); }
.tag-item.mid .tag-bar-fill { background: var(--accent-warning); box-shadow: 0 0 6px rgba(251, 191, 36, 0.25); }

/* ── Batch progress bar ── */
.batch-progress-bar { position: relative; z-index: 1; height: 28px; background: rgba(255,255,255,0.04); border-radius: var(--radius-full); overflow: hidden; margin-bottom: 12px; }
.batch-progress-fill { height: 100%; background: var(--gradient-accent); border-radius: var(--radius-full); transition: width 0.3s ease; }
.batch-progress-info { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; font-size: 11px; font-weight: 600; }
.batch-progress-info span { position: relative; z-index: 2; }
.batch-progress-num { color: #fff; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }

/* ── Batch live log stream ── */
.batch-log-stream { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; max-height: 420px; font-family: var(--font-mono); font-size: 11px; }
.batch-log-line { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: var(--radius-xs); transition: all 0.2s; cursor: default; }
.batch-log-line:hover { background: rgba(255,255,255,0.03); }
.batch-log-line.done { color: var(--text-secondary); cursor: pointer; }
.batch-log-line.error { background: rgba(239,68,68,0.06); }
.batch-log-line.active { color: var(--accent-primary); }
.batch-log-line.selected { background: rgba(244, 114, 182, 0.12); border: 1px solid rgba(244, 114, 182, 0.2); }
.log-status { flex-shrink: 0; font-size: 11px; width: 16px; text-align: center; }
.batch-log-line.done .log-status { color: #34d399; }
.log-file { flex-shrink: 0; width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.log-result { flex: 1; min-width: 0; }
.log-tags-preview { color: var(--text-tertiary); font-size: 10px; margin-left: 4px; }
.log-error-msg { color: #f87171; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-waiting { color: var(--text-tertiary); font-style: italic; }

/* ── Batch detail: preview + editable tags ── */
.batch-detail {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; gap: 10px;
  padding: 12px; margin-top: 8px;
  background: rgba(244, 114, 182, 0.03);
  border: 1px solid rgba(244, 114, 182, 0.12);
  border-radius: var(--radius-md);
}
.batch-preview {
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.2); border-radius: var(--radius-sm);
  max-height: 200px; overflow: hidden;
}
.batch-preview img {
  max-height: 200px; max-width: 100%; object-fit: contain;
}
.batch-tags-section {
  display: flex; flex-direction: column; gap: 6px;
}
.batch-tags-label {
  font-size: 10px; color: var(--text-disabled);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.batch-tags {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.batch-tag-pill {
  font-size: 11px; padding: 3px 8px;
  background: rgba(244, 114, 182, 0.06);
  border: 1px solid rgba(244, 114, 182, 0.15);
  border-radius: var(--radius-full);
  color: var(--accent-primary);
  display: flex; align-items: center; gap: 4px;
  cursor: default; user-select: none;
  transition: all var(--transition-fast);
}
.batch-tag-pill:hover {
  background: rgba(244, 114, 182, 0.14);
  border-color: rgba(244, 114, 182, 0.3);
}
.batch-tag-pill.editing {
  background: rgba(244, 114, 182, 0.15);
  border-color: rgba(244, 114, 182, 0.4);
  padding: 0; overflow: hidden;
}
.batch-tag-pill.add {
  background: transparent; border-style: dashed; border-color: rgba(255,255,255,0.08);
}
.tag-edit-input {
  background: transparent; border: none; outline: none;
  color: var(--accent-primary); font-size: 11px;
  font-family: var(--font-sans); padding: 3px 10px;
  min-width: 50px; width: 100%;
}
.tag-edit-input::placeholder { color: var(--text-disabled); }
.tag-delete-btn {
  font-size: 12px; width: 16px; height: 16px; border-radius: 50%;
  border: none; background: transparent; color: var(--text-tertiary);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity var(--transition-fast);
  line-height: 1; padding: 0; margin-left: 2px;
}
.batch-tag-pill:hover .tag-delete-btn { opacity: 1; }
.tag-delete-btn:hover { background: rgba(248,113,113,0.2); color: #f87171; }
.batch-tag-pill.add-btn {
  cursor: pointer !important;
  background: rgba(255,255,255,0.03) !important;
  border-style: dashed !important;
  border-color: rgba(255,255,255,0.1) !important;
  color: var(--text-tertiary) !important;
  font-size: 10px !important;
}
.batch-tag-pill.add-btn:hover {
  border-color: rgba(244,114,182,0.3) !important;
  color: var(--accent-primary) !important;
}
.batch-detail-actions {
  display: flex; gap: 6px; padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.05);
}

.empty-state { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 24px; color: var(--text-tertiary); text-align: center; }
.empty-state svg { width: 44px; height: 44px; margin-bottom: 12px; opacity: 0.25; }
.empty-state p { font-size: 13px; }

/* Local model path */
.local-path-cabin { border: 1px dashed rgba(var(--accent-primary-rgb), 0.2); border-radius: var(--radius-sm); padding: 12px; }
.path-input-row { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.path-input-row input { flex: 1; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: var(--hud-bg); color: var(--text-secondary); font-size: 11px; font-family: var(--font-mono); }
.cfg-hint { font-size: 10px; color: var(--text-tertiary); margin-top: 4px; display: block; }

/* Light theme overrides */
[data-theme="light"] .tagger-layout { background:rgba(255,245,247,0.45);border-color:rgba(236,72,153,0.2); }
[data-theme="light"] .glass-panel:first-child { background:rgba(255,255,255,0.7); }
[data-theme="light"] .source-tab { background:rgba(255,255,255,0.8);color:#665557; }
[data-theme="light"] .source-tab.active { background:rgba(255,0,127,0.06);color:#FF007F; }
[data-theme="light"] .panel-results { background:rgba(255,245,247,0.6); }
[data-theme="light"] .action-btn:not(:disabled) { background:rgba(255,255,255,0.8);color:#FF007F; }
[data-theme="light"] .tag-item { background:rgba(0,0,0,0.03);border-color:rgba(0,0,0,0.06); }

/* ── Sakura Falling Petals ── */
.sakura-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.petal {
  position: absolute;
  top: -30px;
  animation: sakura-fall linear infinite;
  filter: blur(0.5px);
  user-select: none;
}

@keyframes sakura-fall {
  0% {
    transform: translateY(-20px) translateX(0) rotate(0deg);
    opacity: 0;
  }
  5% {
    opacity: 0.7;
  }
  50% {
    transform: translateY(50vh) translateX(25px) rotate(180deg);
  }
  90% {
    opacity: 0.5;
  }
  100% {
    transform: translateY(105vh) translateX(-10px) rotate(360deg);
    opacity: 0;
  }
}
</style>

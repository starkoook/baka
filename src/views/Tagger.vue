<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTaggerStore } from '@/stores/tagger'
import { useAppStore } from '@/stores/app'
import { useLogStore } from '@/stores/logs'
import { playSuccess } from '@/composables/useSound'

const taggerStore = useTaggerStore()
const appStore = useAppStore()
const logStore = useLogStore()

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
  appStore.setStatus('批量标注中...')

  for (const file of files) {
    batchResults.value.set(file.path, { tags: [], done: false })
    try {
      const imgResult = await window.fsAPI.readImageBase64(file.path)
      if (!imgResult.success) {
        batchResults.value.set(file.path, { tags: [], error: imgResult.error, done: true })
        continue
      }
      const res = await window.llmAPI.tagImage({ imageBase64: imgResult.base64 })
      if (res.success && res.tags) {
        const tags = res.tags.map((tag: string, i: number) => ({
          tag,
          confidence: Math.max(0.99 - i * 0.01, 0.5),
        }))
        batchResults.value.set(file.path, { tags, done: true })
      } else {
        batchResults.value.set(file.path, { tags: [], error: res.error || '失败', done: true })
      }
    } catch (e: any) {
      batchResults.value.set(file.path, { tags: [], error: e.message, done: true })
    }
    batchProgress.value.current++
  }

  // ── Save .txt files + create .已标 folder ──
  let savedCount = 0
  const taggedDir = folderPath.value + '.已标'

  for (const [filePath, result] of batchResults.value.entries()) {
    if (!result.done || result.error) continue
    const tags = result.tags.map((t) => t.tag).join(', ')
    const base = filePath.replace(/\.[^.]+$/, '')
    const txtPath = base + '.txt'

    // Save .txt next to original
    await window.fsAPI.saveCaption({ txtPath, caption: tags })
    savedCount++

    // Copy image to .已标 folder (no txt)
    const ext = filePath.split('.').pop() || 'png'
    const name = filePath.split(/[/\\]/).pop() || 'image.' + ext
    await window.fsAPI.copyFile({ src: filePath, dest: taggedDir + '/' + name, destDir: taggedDir })
  }

  const doneCount = [...batchResults.value.values()].filter((r) => r.done && !r.error).length
  appStore.setStatus(`批量完成 · ${doneCount}/${files.length} 张成功 · 已保存 ${savedCount} 个标注`)
  logStore.success(`已标数据已保存至: ${taggedDir}`)
  playSuccess()
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
  imageBase64.value = null
  imagePreview.value = null
  folderPath.value = ''
  imageFiles.value = []
  batchResults.value.clear()
  batchProgress.value = { current: 0, total: 0 }
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

        <!-- BATCH results -->
        <template v-if="mode === 'batch'">
          <div class="batch-results-scroll" v-if="batchResults.size > 0">
            <div
              v-for="[filePath, result] in [...batchResults.entries()]"
              :key="filePath"
              class="batch-result-card"
            >
              <div class="batch-file-header">
                <span>{{ filePath.split(/[/\\]/).pop() }}</span>
                <span v-if="result.error" class="batch-error">❌ {{ result.error }}</span>
              </div>
              <div class="batch-tags" v-if="result.tags.length > 0">
                <span
                  v-for="(t, idx) in result.tags"
                  :key="idx"
                  class="batch-tag"
                  :class="confidenceClass(t.confidence)"
                >{{ t.tag }}<em>{{ formatPercent(t.confidence) }}</em></span>
              </div>
              <div v-if="!result.done" class="shimmer" style="height: 28px; width: 100%;"></div>
            </div>
          </div>
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
.tagger-page { max-width: 1040px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.01em; }
.page-desc { font-size: 13px; color: var(--text-tertiary); }
.tagger-layout { display: grid; grid-template-columns: 340px 1fr; gap: 18px; align-items: start; }

.panel { padding: 20px; position: relative; }
.panel-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 14px; letter-spacing: 0.02em; display: flex; align-items: center; gap: 8px; }
.source-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full); background: var(--accent-bg); color: var(--accent-primary); }

/* Source tabs */
.config-group { margin-bottom: 14px; }
.source-tabs { display: flex; gap: 6px; }
.source-tab { flex: 1; padding: 8px 12px; border: 1px solid var(--glass-border); border-radius: var(--radius-full); background: var(--glass-bg); color: var(--text-tertiary); font-size: 12px; font-family: var(--font-sans); font-weight: 500; cursor: pointer; transition: all var(--transition-fast); }
.source-tab:hover { background: var(--glass-bg-hover); color: var(--text-secondary); }
.source-tab.active { background: var(--accent-bg); border-color: var(--border-accent); color: var(--accent-primary); font-weight: 600; }

.full-width { width: 100%; }
.btn-group { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }

/* ── Action button (big cute primary) ── */
.action-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; padding: 14px 20px;
  border: none; border-radius: var(--radius-full);
  background: var(--gradient-accent);
  color: #fff; font-size: 15px; font-weight: 700;
  font-family: var(--font-sans); cursor: pointer;
  letter-spacing: 0.03em;
  box-shadow: 0 4px 20px rgba(var(--accent-primary-rgb), 0.35);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;
}
.action-btn::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 50%);
  pointer-events: none;
}
.action-btn:hover {
  transform: scale(1.03);
  box-shadow: 0 8px 30px rgba(var(--accent-primary-rgb), 0.5);
}
.action-btn:active { transform: scale(0.96); }
.action-btn:disabled {
  opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none;
}
.action-btn-icon { font-size: 20px; flex-shrink: 0; line-height: 1; }
.action-btn-text { white-space: nowrap; }

/* ── Clear button (softed ghost) ── */
.clear-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 10px 16px;
  border: 1px solid var(--glass-border); border-radius: var(--radius-full);
  background: var(--glass-bg); backdrop-filter: blur(6px);
  color: var(--text-tertiary); font-size: 12px; font-weight: 500;
  font-family: var(--font-sans); cursor: pointer;
  transition: all 0.25s ease;
}
.clear-btn:hover {
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.25);
  color: #f87171;
}
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

/* ── Results Panel (right side) - slightly deeper than bg + glow edge ── */
.panel-results {
  background: #18131b;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.15);
  border-radius: var(--radius-lg);
  overflow: hidden;
  min-height: 460px;
  box-shadow:
    0 0 16px rgba(var(--accent-primary-rgb), 0.08),
    0 0 40px rgba(var(--accent-primary-rgb), 0.04),
    inset 0 0 40px rgba(0, 0, 0, 0.15);
}

/* Decorative background pattern */
.results-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.06;
  background:
    radial-gradient(ellipse at 20% 20%, #f472b6 0%, transparent 50%),
    radial-gradient(ellipse at 80% 80%, #fb923c 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, #ec4899 0%, transparent 70%),
    repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.02) 20px, rgba(255,255,255,0.02) 22px);
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

/* Batch results */
.batch-results-scroll { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 10px; max-height: 500px; overflow-y: auto; padding-right: 4px; }
.batch-result-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-sm); padding: 12px 14px; }
.batch-file-header { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
.batch-error { color: #f87171; font-weight: 400; font-size: 11px; }
.batch-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.batch-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: var(--radius-full); font-size: 11px; font-weight: 500; background: rgba(255,255,255,0.04); color: var(--text-secondary); }
.batch-tag em { font-style: normal; font-size: 10px; color: var(--text-tertiary); }
.batch-tag.high { background: rgba(52, 211, 153, 0.12); color: #34d399; }
.batch-tag.high em { color: #34d399; }
.batch-tag.mid { background: rgba(251, 191, 36, 0.12); color: #fbbf24; }
.batch-tag.mid em { color: #fbbf24; }

.empty-state { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 24px; color: var(--text-tertiary); text-align: center; }
.empty-state svg { width: 44px; height: 44px; margin-bottom: 12px; opacity: 0.25; }
.empty-state p { font-size: 13px; }

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

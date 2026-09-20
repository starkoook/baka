<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import TagQueue from '@/components/tagger/TagQueue.vue'
import TagEditor from '@/components/tagger/TagEditor.vue'
import TagRunProgress from '@/components/tagger/TagRunProgress.vue'
import TagSettingsPanel from '@/components/tagger/TagSettingsPanel.vue'
import TaggingPreviewDialog from '@/components/tagger/TaggingPreviewDialog.vue'
import LlmPromptDialog from '@/components/tagger/LlmPromptDialog.vue'
import BatchTagToolsDialog from '@/components/tagger/BatchTagToolsDialog.vue'
import VideoToolsDialog from '@/components/tagger/VideoToolsDialog.vue'
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu.vue'
import { toMediaUrl } from '@/lib/media-url'
import type { TagQueueItem, TagResult } from '@/stores/tagger'
import { useTaggerStore } from '@/stores/tagger'
import { useGalleryStore } from '@/stores/gallery'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const taggerStore = useTaggerStore()
const galleryStore = useGalleryStore()
const appStore = useAppStore()
const settingsVisible = ref(false)
const previewSrc = ref('')
const previewLoading = ref(false)
const saving = ref(false)
const queueCollapsed = ref(false)
const refreshing = ref(false)
const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
const showTaggingDialog = ref(false)
const taggingInitialSource = ref<'local' | 'llm' | 'combined'>('local')
const pageModes = [
  { id: 'local' as const, label: 'WD14' },
  { id: 'llm' as const, label: 'LLM' },
  { id: 'combined' as const, label: '混合' },
]
const showPromptDialog = ref(false)
const showBatchToolsDialog = ref(false)
const showVideoDialog = ref(false)
const canStart = computed(() => taggerStore.queue.length > 0 && taggerStore.phase !== 'running' && taggerStore.phase !== 'stopping')
const isBusy = computed(() => taggerStore.phase === 'running' || taggerStore.phase === 'stopping')
const currentFilename = computed(() => taggerStore.currentItem?.path.split(/[/\\]/).pop() || '')
const phaseLabel = computed(() => ({ setup: '准备标注', running: '自动标注中', stopping: '正在停止', review: '人工校对' }[taggerStore.phase]))
const currentTagCount = computed(() => taggerStore.currentItem?.tags.length ?? 0)
const statusLabel: Record<TagQueueItem['status'], string> = {
  pending: '等待', running: '识别中', ready: '待校对', reviewed: '已保存', failed: '失败', partial: '部分保存',
}
const currentModelName = computed(() => taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.name || '未选择模型')

// ── Preview zoom & scroll ──
const previewRef = ref<HTMLElement | null>(null)
const zoom = ref(1)
const naturalSize = ref<{ w: number; h: number } | null>(null)
const fitSize = ref({ w: 0, h: 0 })

const canvasW = computed(() => Math.round(fitSize.value.w * zoom.value))
const canvasH = computed(() => Math.round(fitSize.value.h * zoom.value))

function recomputeFit() {
  const el = previewRef.value
  if (!el || !naturalSize.value) {
    fitSize.value = { w: 0, h: 0 }
    return
  }
  const cw = el.clientWidth
  const ch = el.clientHeight
  if (!cw || !ch) return
  const { w, h } = naturalSize.value
  const scale = Math.min(cw / w, ch / h)
  fitSize.value = { w: Math.round(w * scale), h: Math.round(h * scale) }
}

function onPreviewImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  naturalSize.value = { w: img.naturalWidth, h: img.naturalHeight }
  zoom.value = 1
  recomputeFit()
}

function zoomIn() { zoom.value = Math.min(5, +(zoom.value * 1.25).toFixed(2)) }
function zoomOut() { zoom.value = Math.max(0.2, +(zoom.value / 1.25).toFixed(2)) }
function zoomFit() { zoom.value = 1 }

function onPreviewWheel(event: WheelEvent) {
  if (!event.ctrlKey) return
  event.preventDefault()
  const factor = event.deltaY < 0 ? 1.1 : 0.9
  zoom.value = Math.min(5, Math.max(0.2, +(zoom.value * factor).toFixed(2)))
}

async function refreshQueue() {
  if (!window.fsAPI || refreshing.value) return
  refreshing.value = true
  try {
    const missing: string[] = []
    for (const item of taggerStore.queue) {
      const exists = await window.fsAPI.exists(item.path)
      if (!exists) missing.push(item.path)
    }
    const removed = taggerStore.removeMissing(missing)
    appStore.setStatus(`已检查队列 ${taggerStore.queue.length + removed} 张图片，移除 ${removed} 张失效文件`)
    await loadPreview()
  } finally {
    refreshing.value = false
  }
}

function removeSelected() {
  const item = taggerStore.currentItem
  if (!item) return
  taggerStore.removePaths([item.path])
  appStore.setStatus('已从队列移除选中图片')
  void loadPreview()
}

function closeContextMenu() {
  contextMenu.value = null
}

function showMenu(event: MouseEvent, items: ContextMenuItem[]) {
  const menuHeight = items.length * 33 + 10
  const x = Math.min(event.clientX, window.innerWidth - 190)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)
  contextMenu.value = { x: Math.max(0, x), y: Math.max(0, y), items }
}

function openInFolder(filePath: string) {
  void window.shellAPI?.openFolder(filePath)
}

function copyPath(filePath: string) {
  void navigator.clipboard?.writeText(filePath)
  appStore.setStatus('路径已复制')
}

function openPreviewMenu(event: MouseEvent) {
  const item = taggerStore.currentItem
  if (!item) return
  showMenu(event, [
    { label: '删除选中', danger: true, action: removeSelected },
    { label: '刷新检测', action: () => void refreshQueue() },
    { label: '打开所在文件夹', action: () => openInFolder(item.path) },
    { label: '复制路径', action: () => copyPath(item.path) },
  ])
}

function onQueueContext(index: number, event: MouseEvent) {
  const item = taggerStore.queue[index]
  if (!item) return
  showMenu(event, [
    {
      label: '从队列删除',
      danger: true,
      action: () => {
        taggerStore.removePaths([item.path])
        appStore.setStatus('已从队列移除该图片')
        void loadPreview()
      },
    },
    { label: '打开所在文件夹', action: () => openInFolder(item.path) },
    { label: '复制路径', action: () => copyPath(item.path) },
  ])
}

async function loadPreview() {
  const item = taggerStore.currentItem
  previewSrc.value = ''
  if (!item) return
  previewLoading.value = true
  // 预览图直接走 media://，不再把整张原图 base64 化后经 IPC 传过来
  const exists = window.fsAPI?.exists ? await window.fsAPI.exists(item.path).catch(() => true) : true
  previewSrc.value = exists === false ? '' : toMediaUrl(item.path)
  previewLoading.value = false
}

async function addFiles() {
  const paths = await window.fsAPI.selectImages()
  if (paths?.length) taggerStore.appendPaths(paths)
}

async function addFolder() {
  const folderPath = await window.fsAPI.selectFolder()
  if (!folderPath) return
  const files = await window.fsAPI.listImages(folderPath)
  taggerStore.appendPaths(files.map((file) => file.path))
}

function updateCurrentTags(tags: TagResult[]) {
  if (!taggerStore.currentItem) return
  taggerStore.currentItem.tags = tags
  if (taggerStore.currentItem.status === 'reviewed') taggerStore.currentItem.status = 'ready'
  taggerStore.persistSession()
}

async function saveCurrent() {
  saving.value = true
  try {
    await taggerStore.saveCurrent()
  } finally {
    saving.value = false
  }
}

async function saveAndNext() {
  saving.value = true
  try {
    await taggerStore.saveAndNext()
  } finally {
    saving.value = false
  }
}

function previousImage() {
  taggerStore.setCurrentIndex(taggerStore.currentIndex - 1)
}

function nextImage() {
  taggerStore.setCurrentIndex(taggerStore.currentIndex + 1)
}

function setPageMode(mode: 'local' | 'llm' | 'combined') {
  taggerStore.tagSource = mode
  taggingInitialSource.value = mode
  taggerStore.persistSession()
}

function openTagging(source?: 'local' | 'llm' | 'combined') {
  taggingInitialSource.value = source ?? taggerStore.tagSource
  showTaggingDialog.value = true
}

function onTaggingFailed(message: string) {
  taggerStore.lastError = message
  try { useAppStore().setError(message) } catch { /* */ }
}

function returnToGallery() {
  const context = taggerStore.consumeReturnContext()
  if (context) galleryStore.restoreReturnContext(context)
  router.push('/gallery')
}

function onModelChange(event: Event) {
  taggerStore.activeModelPath = (event.target as HTMLSelectElement).value
  taggerStore.persistSession()
}

function onThresholdInput(event: Event) {
  taggerStore.threshold = Number((event.target as HTMLInputElement).value)
  taggerStore.persistSession()
}

function onCharacterThresholdInput(event: Event) {
  taggerStore.characterThreshold = Number((event.target as HTMLInputElement).value)
}

function persistTagging() {
  void taggerStore.persistTaggingSettings()
}

function onToggleOption(key: 'addCharacter' | 'addCopyright' | 'replaceUnderscores', event: Event) {
  taggerStore[key] = (event.target as HTMLInputElement).checked
  persistTagging()
}

watch(() => taggerStore.currentItem?.path, loadPreview, { immediate: true })

onMounted(async () => {
  taggerStore.restoreSession()
  taggerStore.setupProgressListener()
  await taggerStore.loadModels()
  await loadPreview()
  const el = previewRef.value
  if (el && 'ResizeObserver' in window) {
    const observer = new ResizeObserver(() => recomputeFit())
    observer.observe(el)
  }
})
</script>

<template>
  <main class="tagger-page">
    <section class="tagger-layout">
      <!-- 左：标注设置 -->
      <aside class="tg-panel tg-left" aria-label="标注设置">
        <div class="tg-tabs" role="tablist" aria-label="标注引擎">
          <button
            v-for="mode in pageModes"
            :key="mode.id"
            type="button"
            role="tab"
            :class="{ selected: taggerStore.tagSource === mode.id }"
            :aria-selected="taggerStore.tagSource === mode.id"
            @click="setPageMode(mode.id)"
          >{{ mode.label }}</button>
        </div>

        <section class="tg-section">
          <div class="tg-heading"><h2>01 · 模型</h2><span class="tg-eyebrow">MODEL</span></div>
          <p class="tg-help">{{ taggerStore.tagSource === 'llm' ? 'LLM 模式使用设置里的云端接口，本地模型只在 WD14 / 混合模式下参与。' : '选择本地 ONNX 模型；阈值越低标签越多。' }}</p>
          <label class="tg-field">
            <span>本地模型</span>
            <select class="tg-select" :value="taggerStore.activeModelPath" :disabled="taggerStore.tagSource === 'llm'" @change="onModelChange">
              <option v-if="!taggerStore.models.length" value="">还没有本地模型</option>
              <option v-for="model in taggerStore.models" :key="model.path" :value="model.path">{{ model.name }} · {{ model.resolution }}px</option>
            </select>
          </label>
          <button class="tg-text-button" type="button" @click="settingsVisible = true">管理 / 下载模型 →</button>

          <label class="tg-slider-label" for="tg-threshold"><span>通用标签阈值</span><output>{{ taggerStore.threshold.toFixed(2) }}</output></label>
          <input id="tg-threshold" class="tg-range" type="range" min="0" max="1" step="0.01" :value="taggerStore.threshold" :style="{ '--fill': `${taggerStore.threshold * 100}%` }" @input="onThresholdInput" @change="persistTagging" />
          <label class="tg-slider-label" for="tg-char-threshold"><span>角色标签阈值</span><output>{{ taggerStore.characterThreshold.toFixed(2) }}</output></label>
          <input id="tg-char-threshold" class="tg-range" type="range" min="0" max="1" step="0.01" :value="taggerStore.characterThreshold" :style="{ '--fill': `${taggerStore.characterThreshold * 100}%` }" @input="onCharacterThresholdInput" @change="persistTagging" />

          <div class="tg-control-heading"><span>标签选项</span></div>
          <label class="tg-check"><input type="checkbox" :checked="taggerStore.addCharacter" @change="onToggleOption('addCharacter', $event)" /><span>加入角色标签</span></label>
          <label class="tg-check"><input type="checkbox" :checked="taggerStore.addCopyright" @change="onToggleOption('addCopyright', $event)" /><span>加入版权标签</span></label>
          <label class="tg-check"><input type="checkbox" :checked="taggerStore.replaceUnderscores" @change="onToggleOption('replaceUnderscores', $event)" /><span>下划线转空格</span></label>
        </section>

        <section class="tg-section tg-section--run">
          <div class="tg-heading"><h2>02 · 运行</h2><span class="tg-eyebrow">{{ phaseLabel }}</span></div>
          <button v-if="isBusy" class="tg-primary tg-primary--stop" type="button" :disabled="taggerStore.phase === 'stopping'" @click="taggerStore.stopRun">■ {{ taggerStore.phase === 'stopping' ? '正在停止…' : '停止标注' }}</button>
          <button v-else class="tg-primary" type="button" :disabled="!canStart" @click="openTagging()">▶ 开始自动标注 · {{ pageModes.find((mode) => mode.id === taggerStore.tagSource)?.label }}</button>
          <p class="tg-help tg-help--center">{{ taggerStore.queue.length ? `队列 ${taggerStore.queue.length} 张 · ${taggerStore.completedCount} 张已完成` : '先添加图片到队列' }}</p>
          <div class="tg-tool-grid">
            <button class="tg-tool" type="button" :class="{ selected: showPromptDialog }" @click="showPromptDialog = true"><span>提示词</span><small>LLM</small></button>
            <button class="tg-tool" type="button" :class="{ selected: showBatchToolsDialog }" :disabled="taggerStore.queue.length === 0" @click="showBatchToolsDialog = true"><span>批量工具</span><small>标签</small></button>
            <button class="tg-tool" type="button" :disabled="refreshing" @click="refreshQueue"><span>{{ refreshing ? '检查中…' : '刷新' }}</span><small>队列</small></button>
          </div>
          <div class="tg-run-meta"><span>{{ currentModelName }}</span><span>{{ taggerStore.providers.join(' / ') || '等待设备信息' }}</span></div>
        </section>

        <div class="tg-note"><span aria-hidden="true">✦</span><p>阈值先放宽一点跑一遍，再在右侧逐张校对，比反复重跑更快。</p></div>
        <div class="tg-footer"><span>BAKA TAGGING</span><span>{{ taggerStore.models.length }} 个模型</span></div>
      </aside>

      <!-- 中：画布 + 底部图片工作区 -->
      <section class="tg-editor tagger-workspace" aria-label="标注画布">
        <div class="tg-editor-heading">
          <div>
            <h1>{{ currentFilename || '标签校对' }}</h1>
            <p>
              <template v-if="taggerStore.currentItem">{{ taggerStore.currentIndex + 1 }} / {{ taggerStore.queue.length }} · {{ currentTagCount }} 个标签 · 置信度 {{ taggerStore.threshold.toFixed(2) }}</template>
              <template v-else>从图库送图片过来，或在下方添加，然后开始自动标注。</template>
            </p>
          </div>
          <div class="tg-history">
            <button class="tg-icon-button" type="button" title="上一张（←）" aria-label="上一张" :disabled="taggerStore.currentIndex <= 0" @click="previousImage">←</button>
            <button class="tg-icon-button" type="button" title="下一张（→）" aria-label="下一张" :disabled="taggerStore.currentIndex >= taggerStore.queue.length - 1" @click="nextImage">→</button>
          </div>
        </div>

        <div class="tg-stage tagger-preview" ref="previewRef" @wheel="onPreviewWheel" @contextmenu.prevent="openPreviewMenu">
          <div class="preview-canvas" :style="{ width: canvasW ? `${canvasW}px` : '100%', height: canvasH ? `${canvasH}px` : '100%' }">
            <img v-if="previewSrc" :src="previewSrc" :alt="currentFilename" @load="onPreviewImageLoad" />
          </div>
          <div v-if="previewLoading" class="tg-overlay"><span class="tg-loader"></span><span>正在读取图片</span></div>
          <div v-else-if="!previewSrc" class="tg-overlay tg-overlay--empty">
            <strong>{{ taggerStore.queue.length ? '图片无法预览' : '先准备一批图片吧' }}</strong>
            <span>{{ taggerStore.queue.length ? '文件可能被移动了，可以从队列中重试或重新添加。' : '从图库选择图片送过来，或者点击下方“添加图片”。' }}</span>
          </div>
          <span v-if="taggerStore.currentItem" class="tg-badge">{{ currentFilename }}</span>
          <span v-if="taggerStore.currentItem" class="tg-badge tg-badge--status" :class="`is-${taggerStore.currentItem.status}`">{{ statusLabel[taggerStore.currentItem.status] }}</span>
        </div>

        <div class="tagger-preview__progress">
          <TagRunProgress
            v-if="taggerStore.phase === 'running' || taggerStore.phase === 'stopping'"
            :phase="taggerStore.phase"
            :completed="taggerStore.batchCompleted"
            :total="taggerStore.batchTotal"
            :current-file="taggerStore.batchCurrentFile"
            :provider="taggerStore.batchProvider"
            @stop="taggerStore.stopRun"
          />
          <div v-else-if="taggerStore.lastError" class="run-error">
            <strong>任务没有完成</strong>
            <span>{{ taggerStore.lastError }}</span>
            <button type="button" class="run-error__console" @click="router.push('/console')">打开控制台</button>
          </div>
        </div>

        <section class="tg-board" aria-label="图片工作区">
          <div class="tg-board__actions">
            <div class="tg-canvas-toolbar">
              <div class="tg-view-controls">
                <button class="tg-icon-button" type="button" aria-label="缩小" @click="zoomOut">−</button>
                <button class="tg-zoom-value" type="button" title="适应画布" @click="zoomFit">{{ Math.round(zoom * 100) }}%</button>
                <button class="tg-icon-button" type="button" aria-label="放大" @click="zoomIn">＋</button>
              </div>
              <button class="tg-quiet" type="button" :disabled="!taggerStore.currentItem" @click="removeSelected">从队列移除</button>
              <button v-if="taggerStore.returnContext" class="tg-quiet" type="button" @click="returnToGallery">← 返回图库原位置</button>
              <button v-if="taggerStore.queue.some((item) => item.status === 'failed' || item.status === 'partial')" class="tg-quiet tg-quiet--warn" type="button" @click="taggerStore.retryFailed">重试失败项目</button>
            </div>
            <div class="tg-import-actions">
              <button class="tg-quiet" type="button" @click="addFiles">＋ 添加图片</button>
              <button class="tg-quiet" type="button" @click="addFolder">导入文件夹</button>
              <button class="tg-quiet" type="button" :aria-expanded="!queueCollapsed" @click="queueCollapsed = !queueCollapsed">{{ queueCollapsed ? '展开队列' : '收起队列' }}</button>
            </div>
          </div>
          <TagQueue
            :queue="taggerStore.queue"
            :current-index="taggerStore.currentIndex"
            :collapsed="queueCollapsed"
            @select="taggerStore.setCurrentIndex"
            @add-files="addFiles"
            @add-folder="addFolder"
            @retry="taggerStore.retryFailed"
            @remove-selected="removeSelected"
            @context="onQueueContext"
            @toggle-collapsed="queueCollapsed = !queueCollapsed"
          />
          <div class="tg-board__meta">
            <span>{{ taggerStore.queue.length }} 张图片 · {{ taggerStore.completedCount }} 张已保存<template v-if="taggerStore.failedCount"> · {{ taggerStore.failedCount }} 张失败</template></span>
            <span>← → 切换 · Ctrl + 滚轮缩放 · 右键更多操作</span>
          </div>
        </section>
      </section>

      <!-- 右：标签校对 -->
      <TagEditor
        :item="taggerStore.currentItem"
        :saving="saving"
        @update-tags="updateCurrentTags"
        @save="saveCurrent"
        @save-next="saveAndNext"
      />
    </section>

    <TagSettingsPanel
      :visible="settingsVisible"
      :models="taggerStore.models"
      :model-value="taggerStore.activeModelPath"
      :threshold="taggerStore.threshold"
      :character-threshold="taggerStore.characterThreshold"
      :add-character="taggerStore.addCharacter"
      :add-copyright="taggerStore.addCopyright"
      :replace-underscores="taggerStore.replaceUnderscores"
      :providers="taggerStore.providers"
      @close="settingsVisible = false"
      @update:model-value="taggerStore.activeModelPath = $event; taggerStore.persistSession()"
      @update:threshold="taggerStore.threshold = $event; taggerStore.persistSession(); void taggerStore.persistTaggingSettings()"
      @update:character-threshold="taggerStore.characterThreshold = $event; void taggerStore.persistTaggingSettings()"
      @update:add-character="taggerStore.addCharacter = $event; void taggerStore.persistTaggingSettings()"
      @update:add-copyright="taggerStore.addCopyright = $event; void taggerStore.persistTaggingSettings()"
      @update:replace-underscores="taggerStore.replaceUnderscores = $event; void taggerStore.persistTaggingSettings()"
      @refresh="taggerStore.loadModels"
    />

    <TaggingPreviewDialog
      :visible="showTaggingDialog"
      :initial-source="taggingInitialSource"
      :image-paths="taggerStore.queue.map((item) => item.path)"
      :selected-image-paths="taggerStore.currentItem ? [taggerStore.currentItem.path] : []"
      :model-path="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.path || taggerStore.activeModelPath || taggerStore.models[0]?.path"
      :csv-path="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.csvPath ?? null"
      :threshold="taggerStore.threshold"
      :providers="taggerStore.providers"
      :normalization="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.normalization"
      :pad-color="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.padColor"
      :resize-mode="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.resizeMode"
      :input-layout="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.inputLayout"
      :resolution="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.resolution"
      @close="showTaggingDialog = false"
      @applied="taggerStore.reloadCaptionsFromDisk()"
      @failed="onTaggingFailed"
    />

    <LlmPromptDialog
      :visible="showPromptDialog"
      @close="showPromptDialog = false"
    />

    <BatchTagToolsDialog
      :visible="showBatchToolsDialog"
      :image-paths="taggerStore.queue.map((item) => item.path)"
      @close="showBatchToolsDialog = false"
      @applied="taggerStore.reloadCaptionsFromDisk"
    />

    <VideoToolsDialog
      :visible="showVideoDialog"
      :video-path="taggerStore.currentItem?.path ?? null"
      @close="showVideoDialog = false"
      @frames="(paths) => taggerStore.appendPaths(paths)"
    />

    <ContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @close="closeContextMenu"
    />
  </main>
</template>

<style scoped>
/* ── 标注工作台：参照 liquid-studio-mint 的淡绿三栏工作台 ── */
.tagger-page {
  --tg-bg: #f5f7f1; --tg-panel: #fcfdf9; --tg-line: #e1e7db; --tg-mint: #e5eddd; --tg-stage: #e9eee2;
  --tg-text: #34402f; --tg-muted: #788271; --tg-soft: #8a9581; --tg-green: #53694c; --tg-deep: #31472e;
  --tg-primary: #58734a; --tg-selected-bg: #e6eedc; --tg-selected-border: #bacbaa; --tg-selected-text: #405b33;
  --tg-warn: #a86a3c; --tg-warn-bg: #f6ede2; --tg-danger: #a3474f; --tg-danger-bg: #f5e6e6;
  height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 14px 16px 12px 12px; overflow: hidden;
  border-radius: 22px; background: var(--tg-bg); color: var(--tg-text); font-size: 13px; line-height: 1.5;
}
.tagger-layout { flex: 1; min-width: 0; min-height: 0; display: grid; grid-template-columns: 250px minmax(360px, 1fr) 300px; gap: 16px; }
.tg-panel { min-height: 0; display: flex; flex-direction: column; overflow-y: auto; background: var(--tg-panel); border: 1px solid var(--tg-line); border-radius: 12px; scrollbar-width: thin; scrollbar-color: #cad7be transparent; }

/* 左栏 */
.tg-tabs { position: sticky; top: 0; z-index: 2; display: flex; gap: 5px; flex-shrink: 0; padding: 12px; background: #f6f9f0; border-bottom: 1px solid var(--tg-line); }
.tg-tabs button { flex: 1; padding: 8px 3px; border: 0; border-radius: 6px; background: none; color: #809071; font: inherit; font-size: 13px; cursor: pointer; }
.tg-tabs button.selected { background: #e2ebd7; color: #3f5c31; }
.tg-tabs button:hover:not(.selected) { background: #eef3e7; }
.tg-section { flex-shrink: 0; padding: 20px 18px; }
.tg-section + .tg-section { border-top: 1px solid var(--tg-line); }
.tg-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.tg-heading h2 { margin: 0; font-size: 15px; font-weight: 500; }
.tg-eyebrow { font: 10px/1.5 Arial, sans-serif; letter-spacing: .09em; color: var(--tg-soft); text-transform: uppercase; }
.tg-help { margin: 0 0 12px; font-size: 12px; line-height: 1.7; color: #68795e; }
.tg-help--center { text-align: center; margin: 10px 0 12px; }
.tg-field { display: grid; gap: 6px; font-size: 12px; color: #8b967f; }
.tg-select { width: 100%; padding: 8px 8px; border: 1px solid #dce3d4; border-radius: 5px; background: #fafcf5; color: #5b6d4d; font: inherit; font-size: 12px; cursor: pointer; }
.tg-select:disabled { opacity: .5; cursor: default; }
.tg-text-button { display: inline-block; margin-top: 8px; padding: 0; border: 0; background: none; color: #6f8362; font: inherit; font-size: 12px; cursor: pointer; border-bottom: 1px solid #c4cfb9; }
.tg-text-button:hover { color: var(--tg-deep); }
.tg-slider-label { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 6px; font-size: 13px; }
.tg-slider-label output { font-size: 12px; color: #7d8874; font-variant-numeric: tabular-nums; }
.tg-range { display: block; width: 100%; height: 18px; margin: 0; appearance: none; background: transparent; cursor: pointer; --fill: 50%; }
.tg-range::-webkit-slider-runnable-track { height: 3px; border-radius: 3px; background: linear-gradient(to right, #9aae87 0 var(--fill), #e4e8dd var(--fill) 100%); }
.tg-range::-webkit-slider-thumb { appearance: none; width: 13px; height: 13px; margin-top: -5px; border: 1px solid #c7d1be; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #31472e16; }
.tg-control-heading { display: flex; align-items: center; justify-content: space-between; margin: 18px 0 8px; font-size: 13px; }
.tg-check { display: flex; align-items: center; gap: 9px; padding: 6px 0; font-size: 13px; color: #55684b; cursor: pointer; }
.tg-check input { width: 15px; height: 15px; margin: 0; accent-color: var(--tg-primary); }
.tg-primary { display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; padding: 11px; border: 0; border-radius: 6px; background: var(--tg-primary); color: #fff; font: inherit; font-size: 13.5px; letter-spacing: .06em; cursor: pointer; box-shadow: 0 3px 6px #3852290a; }
.tg-primary:hover:not(:disabled) { filter: brightness(.96); }
.tg-primary:disabled { opacity: .35; cursor: default; }
.tg-primary--stop { background: var(--tg-danger); }
.tg-tool-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.tg-tool { position: relative; display: flex; flex-direction: column; gap: 4px; align-items: center; padding: 10px 3px 8px; border: 1px solid var(--tg-line); border-radius: 7px; background: #fafbf7; color: #5b6d4d; font: inherit; font-size: 12.5px; cursor: pointer; }
.tg-tool small { font-size: 10px; color: var(--tg-soft); letter-spacing: .06em; }
.tg-tool:hover:not(:disabled) { background: #f3f7ee; }
.tg-tool.selected { background: var(--tg-selected-bg); border-color: var(--tg-selected-border); color: var(--tg-selected-text); }
.tg-tool:disabled { opacity: .35; cursor: default; }
.tg-run-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 14px; color: var(--tg-soft); font-size: 11px; }
.tg-run-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tg-note { margin: auto 18px 16px; padding-top: 16px; display: flex; align-items: flex-start; gap: 9px; color: #849078; }
.tg-note span { flex-shrink: 0; margin-top: 2px; font-size: 12px; color: #8ca07f; }
.tg-note p { margin: 0; font-size: 12px; line-height: 1.8; color: #68795e; }
.tg-footer { flex-shrink: 0; display: flex; justify-content: space-between; padding: 12px 18px; border-top: 1px solid var(--tg-line); color: #9aa38f; font-size: 10px; letter-spacing: .07em; }

/* 中栏 */
.tg-editor { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 0 2px; }
.tg-editor-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-height: 60px; padding: 2px 4px 12px; }
.tg-editor-heading h1 { margin: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: Arial, 'Microsoft YaHei', sans-serif; font-size: 22px; font-weight: 500; letter-spacing: .06em; }
.tg-editor-heading p { margin: 6px 0 0; color: #68795e; font-size: 12px; }
.tg-history { display: flex; gap: 5px; padding-top: 3px; flex: none; }
.tg-icon-button { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--tg-line); border-radius: 5px; background: #fafcf6; color: #55684b; font: inherit; font-size: 15px; cursor: pointer; }
.tg-icon-button:hover:not(:disabled) { filter: brightness(.96); }
.tg-icon-button:disabled { opacity: .3; cursor: default; }
.tg-stage { position: relative; flex: 1; min-height: 240px; display: flex; overflow: auto; border: 1px solid #dee5d7; border-radius: 8px; background: var(--tg-stage); scrollbar-width: thin; scrollbar-color: #cad7be transparent; }
.preview-canvas { position: relative; z-index: 1; margin: auto; flex: none; display: flex; align-items: center; justify-content: center; }
.preview-canvas img { display: block; width: 100%; height: 100%; object-fit: contain; box-shadow: 0 5px 24px #29352214; }
.tg-overlay { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; color: #61744f; font-size: 13px; background: #eef3e7e8; }
.tg-overlay--empty strong { font-size: 15px; font-weight: 500; color: #3f5c31; }
.tg-overlay--empty span { max-width: 320px; text-align: center; font-size: 12px; line-height: 1.7; color: #68795e; }
.tg-loader { width: 24px; height: 24px; border: 2px solid #c8d6bb; border-top-color: #547342; border-radius: 50%; animation: tg-spin 1s linear infinite; }
@keyframes tg-spin { to { transform: rotate(360deg); } }
.tg-badge { position: absolute; z-index: 3; left: 14px; bottom: 13px; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 9px; border-radius: 4px; background: #f9fbf1dc; color: #5f7150; font-size: 11px; pointer-events: none; }
.tg-badge--status { left: auto; right: 14px; top: 13px; bottom: auto; }
.tg-badge--status.is-reviewed { color: #3f6b3a; background: #e6f1dfdd; }
.tg-badge--status.is-ready, .tg-badge--status.is-running { color: #3d6079; background: #e5eef6dd; }
.tg-badge--status.is-failed, .tg-badge--status.is-partial { color: var(--tg-danger); background: #f7e8e8dd; }
.tagger-preview__progress { flex: none; margin-top: 8px; }
.tagger-preview__progress:empty { display: none; }
.run-error { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid #e8d2d2; border-radius: 6px; background: var(--tg-danger-bg); font-size: 12px; }
.run-error strong { color: var(--tg-danger); font-weight: 500; }
.run-error span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6d5a5a; }
.run-error__console { border: 1px solid #e0c9c9; border-radius: 5px; background: #fff; color: var(--tg-danger); padding: 4px 10px; font: inherit; font-size: 11px; cursor: pointer; }

/* 底部图片工作区 */
.tg-board { flex-shrink: 0; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--tg-line); }
.tg-board__actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; min-height: 40px; }
.tg-canvas-toolbar, .tg-import-actions { display: flex; align-items: center; gap: 6px; }
.tg-view-controls { display: flex; align-items: center; border: 1px solid var(--tg-line); border-radius: 6px; background: #fafcf6; }
.tg-view-controls .tg-icon-button { width: 28px; height: 28px; border: 0; background: transparent; font-size: 14px; }
.tg-zoom-value { min-width: 48px; padding: 0 4px; border: 0; background: transparent; color: #77836b; font: inherit; font-size: 12px; cursor: pointer; }
.tg-quiet { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 0; border-radius: 5px; background: none; color: #55684b; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.tg-quiet:hover:not(:disabled) { background: #eef3e7; }
.tg-quiet:disabled { opacity: .35; cursor: default; }
.tg-quiet--warn { color: var(--tg-warn); }
.tg-board__meta { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 4px; color: #6c8072; font-size: 11px; }

@media (max-width: 1240px) {
  .tagger-layout { grid-template-columns: 220px minmax(300px, 1fr) 260px; gap: 12px; }
  .tg-section { padding: 16px 14px; }
  .tg-board__meta span:last-child { display: none; }
}
@media (max-width: 980px) {
  .tagger-layout { grid-template-columns: 200px minmax(0, 1fr); }
  .tagger-page { padding: 10px; }
}
@media (max-width: 760px) {
  .tagger-page { overflow-x: hidden; padding: 8px; }
  .tagger-layout { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .tg-left { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .tg-loader { animation: none; }
}
</style>

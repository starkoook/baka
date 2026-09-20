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
import AppIcon from '@/components/common/AppIcon.vue'
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu.vue'
import { toMediaUrl } from '@/lib/media-url'
import type { TagResult } from '@/stores/tagger'
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
const posterSrc = ref('')
const canStart = computed(() => taggerStore.queue.length > 0 && taggerStore.phase !== 'running' && taggerStore.phase !== 'stopping')
const isBusy = computed(() => taggerStore.phase === 'running' || taggerStore.phase === 'stopping')
const currentFilename = computed(() => taggerStore.currentItem?.path.split(/[/\\]/).pop() || '')
const phaseLabel = computed(() => ({ setup: '准备标注', running: '自动标注中', stopping: '正在停止', review: '人工校对' }[taggerStore.phase]))

watch(
  () => appStore.toolPosters.tagger,
  async (path) => {
    posterSrc.value = ''
    if (!path || !window.fsAPI) return
    const result = await window.fsAPI.readImageBase64(path)
    if (result.success && result.base64) {
      posterSrc.value = `data:${result.mime || 'image/png'};base64,${result.base64}`
    }
  },
  { immediate: true },
)

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

function openLlmTagging() {
  taggerStore.tagSource = 'llm'
  taggerStore.persistSession()
  openTagging('llm')
}

function returnToGallery() {
  const context = taggerStore.consumeReturnContext()
  if (context) galleryStore.restoreReturnContext(context)
  router.push('/gallery')
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
    <header class="tagger-rail">
      <div class="tagger-identity">
        <div class="tagger-identity__poster">
          <img v-if="posterSrc" :src="posterSrc" alt="" />
          <div v-else class="tagger-identity__fallback" aria-hidden="true">
            <AppIcon name="tagger" />
          </div>
        </div>
        <div class="tagger-identity__copy">
          <span class="tagger-identity__eyebrow">ANNOTATION</span>
          <strong class="tagger-identity__title">标注</strong>
          <p class="tagger-identity__meta">{{ phaseLabel }} · {{ taggerStore.completedCount }}/{{ taggerStore.queue.length }}</p>
        </div>
      </div>


    </header>

    <section class="tagger-layout">
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

      <div class="tagger-workspace">
        <div class="tagger-preview__toolbar">
          <div>
            <strong>{{ currentFilename || '没有选择图片' }}</strong>
            <span v-if="taggerStore.currentItem">{{ taggerStore.currentIndex + 1 }} / {{ taggerStore.queue.length }}</span>
          </div>
          <div>
            <button :disabled="taggerStore.currentIndex <= 0" @click="previousImage">← 上一张</button>
            <button :disabled="taggerStore.currentIndex >= taggerStore.queue.length - 1" @click="nextImage">下一张 →</button>
          </div>
        </div>

        <div class="tagger-preview" ref="previewRef" @wheel="onPreviewWheel" @contextmenu.prevent="openPreviewMenu">
          <div class="preview-canvas" :style="{ width: canvasW ? `${canvasW}px` : '100%', height: canvasH ? `${canvasH}px` : '100%' }">
            <img
              v-if="previewSrc"
              :src="previewSrc"
              :alt="currentFilename"
              @load="onPreviewImageLoad"
            />
          </div>
          <div v-if="previewLoading" class="preview-loading"><span></span>正在读取图片</div>
          <div v-else-if="!previewSrc" class="preview-empty">
            <strong>{{ taggerStore.queue.length ? '图片无法预览' : '先准备一批图片吧' }}</strong>
            <span>{{ taggerStore.queue.length ? '文件可能被移动了，可以从队列中重试或重新添加。' : '从图库选择图片送过来，或者点击左下角继续添加。' }}</span>
          </div>
      <nav class="tagger-dock" aria-label="标注命令">
        <div class="tagger-modes" role="tablist" aria-label="标注模式">
          <button
            v-for="mode in pageModes"
            :key="mode.id"
            type="button"
            role="tab"
            :class="{ 'is-active': taggerStore.tagSource === mode.id }"
            :aria-selected="taggerStore.tagSource === mode.id"
            @click="setPageMode(mode.id)"
          >{{ mode.label }}</button>
        </div>
        <div class="tagger-dock__tiles">
        <button
          v-if="isBusy"
          type="button"
          class="dock-tile dock-tile--lg dock-tile--stop"
          :disabled="taggerStore.phase === 'stopping'"
          :aria-label="taggerStore.phase === 'stopping' ? '正在停止' : '停止'"
          @click="taggerStore.stopRun"
        >
          <span class="dock-tile__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="6.5" y="6.5" width="11" height="11" rx="1.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span class="dock-tile__label">停止</span>
        </button>
        <button
          v-else
          type="button"
          class="dock-tile dock-tile--lg dock-tile--start"
          :disabled="!canStart"
          aria-label="开始"
          @click="openTagging()"
        >
          <span class="dock-tile__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M8.2 6.4v11.2L18.4 12Z" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span class="dock-tile__label">开始</span>
          <span class="dock-tile__sub">{{ pageModes.find((mode) => mode.id === taggerStore.tagSource)?.label }}</span>
        </button>

        <button
          type="button"
          class="dock-tile"
          :class="{ 'is-open': showTaggingDialog && taggingInitialSource === 'llm', 'is-muted': taggerStore.tagSource === 'local' }"
          aria-label="LLM"
          @click="openLlmTagging"
        >
          <span class="dock-tile__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5.2 16.6 7.8 8.4h2.1l2.6 8.2" />
              <path d="M6.1 14.2h5.2" />
              <path d="M14.4 8.4h4.4" />
              <path d="M16.6 8.4v8.2" />
            </svg>
          </span>
          <span class="dock-tile__label">LLM</span>
        </button>

        <button
          type="button"
          class="dock-tile"
          :class="{ 'is-open': showPromptDialog, 'is-muted': taggerStore.tagSource === 'local' }"
          aria-label="提示词"
          @click="showPromptDialog = true"
        >
          <span class="dock-tile__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3.6 13.15 8.1 17.6 9.25 13.15 10.4 12 14.9 10.85 10.4 6.4 9.25 10.85 8.1Z" />
              <path d="M16.2 14.6 20 18.4" />
              <path d="M15.4 18.2h5.2" />
              <path d="M4.8 16.4h4.4" />
              <path d="M4.8 19.2h6.2" />
            </svg>
          </span>
          <span class="dock-tile__label">提示词</span>
        </button>

        <button
          type="button"
          class="dock-tile"
          :class="{ 'is-open': settingsVisible, 'is-muted': taggerStore.tagSource === 'llm' }"
          aria-label="WD14"
          @click="settingsVisible = true"
        >
          <span class="dock-tile__icon">
            <AppIcon name="tagger" />
          </span>
          <span class="dock-tile__label">WD14</span>
        </button>

        <button
          type="button"
          class="dock-tile"
          :disabled="refreshing"
          :aria-label="refreshing ? '检查中' : '刷新'"
          @click="refreshQueue"
        >
          <span class="dock-tile__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8" />
              <path d="M20.2 4.6v4.6h-4.6" />
            </svg>
          </span>
          <span class="dock-tile__label">{{ refreshing ? '检查中…' : '刷新' }}</span>
        </button>

        <button
          type="button"
          class="dock-tile"
          :class="{ 'is-open': showBatchToolsDialog }"
          :disabled="taggerStore.queue.length === 0"
          aria-label="批量"
          @click="showBatchToolsDialog = true"
        >
          <span class="dock-tile__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3.8 20 8.2 12 12.6 4 8.2Z" />
              <path d="M4 12.2 12 16.6 20 12.2" />
              <path d="M4 16.2 12 20.6 20 16.2" />
            </svg>
          </span>
          <span class="dock-tile__label">批量</span>
        </button>

        <button
          v-if="taggerStore.returnContext"
          type="button"
          class="dock-tile"
          aria-label="返回"
          @click="returnToGallery"
        >
          <span class="dock-tile__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 12H6.2" />
              <path d="m11.2 17.2-5-5.2 5-5.2" />
            </svg>
          </span>
          <span class="dock-tile__label">返回</span>
        </button>
        </div>
      </nav>

          <div v-if="previewSrc" class="preview-zoom" aria-label="图片缩放">
            <button type="button" title="缩小" @click="zoomOut">−</button>
            <span class="preview-zoom__value">{{ Math.round(zoom * 100) }}%</span>
            <button type="button" title="放大" @click="zoomIn">＋</button>
            <button type="button" title="适应窗口" @click="zoomFit">适应</button>
          </div>
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
          <div v-else class="run-summary"><span>模型：{{ taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.name || '未选择' }}</span><span>阈值 {{ taggerStore.threshold.toFixed(2) }}</span><span>{{ taggerStore.providers.join(' / ') || '等待设备信息' }}</span></div>
        </div>
      </div>

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
.tagger-page { height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 6px 10px 10px; color: var(--text-primary); overflow: hidden; }
.tagger-layout { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 12px; overflow: hidden; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.tagger-workspace { flex: 1; min-width: 320px; min-height: 0; display: flex; flex-direction: column; }
.tagger-preview__toolbar { height: 48px; flex: none; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding: 0 8px 0 16px; border: 0; border-radius: var(--radius-pill); background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.tagger-preview__toolbar > div { display: flex; align-items: center; gap: 8px; }
.tagger-preview__toolbar strong { max-width: 35vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-primary); font-size: 13.5px; font-weight: 800; }
.tagger-preview__toolbar span { color: var(--text-tertiary); font: 11px ui-monospace, monospace; }
.tagger-preview__toolbar button { height: 32px; padding: 0 14px; border: 0; border-radius: var(--radius-pill); background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; }
.tagger-preview__toolbar button:disabled { opacity: .25; }
.tagger-preview { position: relative; flex: 1; min-height: 0; display: flex; overflow: auto; border-radius: 28px; background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.tagger-preview::before { content: ''; position: absolute; inset: 0; opacity: .6; background-image: radial-gradient(var(--line-strong) 1px, transparent 1.2px); background-size: 22px 22px; }
.preview-canvas { position: relative; z-index: 1; margin: auto; flex: none; display: flex; align-items: center; justify-content: center; }
.preview-canvas img { display: block; width: 100%; height: 100%; object-fit: contain; border-radius: 16px; box-shadow: var(--ink-shadow); }
.preview-loading { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--text-tertiary); font-size: 12px; }
.preview-loading span { width: 11px; height: 11px; border: 2px solid rgba(255,255,255,.08); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin .75s linear infinite; }
.preview-empty { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-tertiary); text-align: center; }
.preview-empty strong { color: var(--ink-primary); font-size: 17px; font-weight: 900; }
.preview-empty > span { max-width: 280px; font-size: 12px; line-height: 1.6; }
.preview-zoom {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 7px;
  border: 0;
  border-radius: 999px;
  background: var(--ink-primary);
  box-shadow: var(--ink-shadow);
}
.preview-zoom button {
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: rgba(255,255,255,.07);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.preview-zoom button:hover { background: rgba(255,255,255,.14); color: var(--text-primary); }
.preview-zoom__value {
  min-width: 46px;
  text-align: center;
  color: var(--text-secondary);
  font: 11px ui-monospace, monospace;
}
.tagger-preview__progress { flex: none; margin-top: 8px; padding: 6px 9px; border: 0; border-radius: 10px; background: linear-gradient(135deg, rgba(255,255,255,.045), rgba(255,255,255,.018)); }
.run-summary { height: 30px; display: flex; align-items: center; gap: 10px; color: var(--text-tertiary); font-size: 11px; }
.run-summary span + span::before { content: '·'; margin-right: 10px; color: rgba(255,255,255,.15); }
.run-error__console { align-self:flex-start; border:0; background:var(--brand-soft); color:var(--brand-primary); border-radius:999px; padding:4px 10px; font:inherit; font-size:11px; cursor:pointer; }
.run-error { display: flex; gap: 8px; padding: 8px 10px; border: 1px solid rgba(255,137,117,.13); border-radius: 8px; background: rgba(255,137,117,.05); font-size: 11px; }
.run-error strong { color: #ff9a86; }
.run-error span { color: var(--text-tertiary); }

.tagger-rail {
  height: 48px;
  flex: 0 0 48px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px;
}
.tagger-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}
.tagger-identity__poster {
  width: 40px;
  height: 40px;
  flex: none;
  overflow: hidden;
  border-radius: 11px;
  box-shadow: var(--surface-shadow);
}
.tagger-identity__poster img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tagger-identity__fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, var(--brand-soft), color-mix(in srgb, var(--accent-primary) 38%, var(--surface-primary)));
  color: var(--brand-on-primary, #fff);
}
.tagger-identity__fallback :deep(svg) { width: 20px; height: 20px; }
.tagger-identity__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
}
.tagger-identity__eyebrow {
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .16em;
  line-height: 1.1;
}
.tagger-identity__title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 750;
  line-height: 1.15;
}
.tagger-identity__meta {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.25;
}
.tagger-dock {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 4;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 200px);
  padding: 8px 12px 10px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 18px;
  background: rgba(17, 15, 21, .58);
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 36px rgba(0,0,0,.34);
}
.tagger-modes {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(255,255,255,.06);
}
.tagger-modes button {
  height: 22px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}
.tagger-modes button.is-active {
  background: var(--accent-primary);
  color: #fff;
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-primary) 45%, transparent);
}
.dock-tile.is-muted { opacity: 0.34; }
.dock-tile.is-muted .dock-tile__icon { border-color: rgba(255,255,255,.05); }
.dock-tile__sub { color: var(--accent-primary); font-size: 10px; font-weight: 700; line-height: 1; }
.tagger-dock__tiles {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 10px;
  min-width: 0;
}
.dock-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
.dock-tile__icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-primary) 78%, transparent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
  transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}
.dock-tile__icon svg,
.dock-tile__icon :deep(svg) { width: 22px; height: 22px; }
.dock-tile__label {
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}
.dock-tile--lg .dock-tile__icon { width: 52px; height: 52px; }
.dock-tile--start .dock-tile__icon {
  border-color: color-mix(in srgb, var(--accent-primary) 55%, transparent);
  background: var(--accent-primary);
  color: #fff;
  box-shadow: 0 0 18px color-mix(in srgb, var(--accent-primary) 42%, transparent);
}
.dock-tile--start .dock-tile__label { color: var(--text-secondary); font-weight: 650; }
.dock-tile--stop .dock-tile__icon {
  border-color: color-mix(in srgb, var(--accent-danger) 40%, transparent);
  background: color-mix(in srgb, var(--accent-danger) 18%, var(--surface-primary));
  color: var(--accent-danger);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent-danger) 28%, transparent);
}
.dock-tile--stop .dock-tile__label { color: var(--accent-danger); font-weight: 650; }
.dock-tile:hover:not(:disabled) .dock-tile__icon {
  transform: translateY(-1px);
  border-color: rgba(255,255,255,.18);
  background: color-mix(in srgb, var(--surface-primary) 92%, #fff);
}
.dock-tile--start:hover:not(:disabled) .dock-tile__icon {
  border-color: color-mix(in srgb, var(--accent-primary) 80%, #fff);
  background: var(--accent-primary);
}
.dock-tile--stop:hover:not(:disabled) .dock-tile__icon {
  border-color: color-mix(in srgb, var(--accent-danger) 60%, #fff);
}
.dock-tile.is-open .dock-tile__icon {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 42%, transparent), inset 0 0 12px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}
.dock-tile:disabled { opacity: .38; cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) {
  .dock-tile__icon { transition: none; }
}

@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1200px) {
  .tagger-layout { gap: 10px; }
  .tagger-workspace { min-width: 280px; }
}
@media (max-width: 760px) {
  .tagger-page { padding: 8px; overflow-x: hidden; }
  .tagger-layout { gap: 8px; }
  .tagger-rail { gap: 8px; }
  .tagger-dock__tiles { gap: 6px; }
}
</style>

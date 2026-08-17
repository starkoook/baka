<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import TagQueue from '@/components/tagger/TagQueue.vue'
import TagEditor from '@/components/tagger/TagEditor.vue'
import TagRunProgress from '@/components/tagger/TagRunProgress.vue'
import TagSettingsPanel from '@/components/tagger/TagSettingsPanel.vue'
import TaggingPreviewDialog from '@/components/tagger/TaggingPreviewDialog.vue'
import VideoToolsDialog from '@/components/tagger/VideoToolsDialog.vue'
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu.vue'
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
const showVideoDialog = ref(false)

const canStart = computed(() => taggerStore.queue.length > 0 && !!taggerStore.activeModelPath && taggerStore.phase !== 'running' && taggerStore.phase !== 'stopping')
const currentFilename = computed(() => taggerStore.currentItem?.path.split(/[/\\]/).pop() || '')
const phaseLabel = computed(() => ({ setup: '准备标注', running: '自动标注中', stopping: '正在停止', review: '人工校对' }[taggerStore.phase]))
const selectedModelLabel = computed(() => taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.name || '未选择模型')

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
  const response = await window.fsAPI.readImageBase64(item.path)
  if (response.success && response.base64) previewSrc.value = `data:${response.mime || 'image/png'};base64,${response.base64}`
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
    <header class="tagger-toolbar">
      <div class="tagger-toolbar__status">
        <strong>标注</strong>
        <span>{{ phaseLabel }} · {{ taggerStore.completedCount }} / {{ taggerStore.queue.length }}</span>
      </div>
      <button class="tagger-toolbar__model" @click="settingsVisible = true">模型：{{ selectedModelLabel }}</button>
      <div class="tagger-toolbar__actions">
        <button class="quiet" :disabled="taggerStore.queue.length === 0" @click="showTaggingDialog = true">LLM 批量打标</button>
        <button v-if="taggerStore.returnContext" class="quiet" @click="returnToGallery">← 返回图库原位置</button>
        <button class="quiet" :disabled="refreshing" @click="refreshQueue">{{ refreshing ? '检查中…' : '刷新' }}</button>
        <button class="quiet" @click="settingsVisible = true">模型设置</button>
        <button v-if="taggerStore.phase === 'running' || taggerStore.phase === 'stopping'" class="stop" :disabled="taggerStore.phase === 'stopping'" @click="taggerStore.stopRun">{{ taggerStore.phase === 'stopping' ? '正在停止…' : '停止' }}</button>
        <button v-else class="primary" :disabled="!canStart" @click="taggerStore.startRun">开始自动标注</button>
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
          <div><strong>{{ currentFilename || '没有选择图片' }}</strong><span v-if="taggerStore.currentItem">{{ taggerStore.currentIndex + 1 }} / {{ taggerStore.queue.length }}</span></div>
          <div><button :disabled="taggerStore.currentIndex <= 0" @click="previousImage">← 上一张</button><button :disabled="taggerStore.currentIndex >= taggerStore.queue.length - 1" @click="nextImage">下一张 →</button></div>
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
          <div v-else class="preview-empty">
            <strong>{{ taggerStore.queue.length ? '图片无法预览' : '先准备一批图片吧' }}</strong>
            <span>{{ taggerStore.queue.length ? '文件可能被移动了，可以从队列中重试或重新添加。' : '从图库选择图片送过来，或者点击左下角继续添加。' }}</span>
          </div>
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
          <div v-else-if="taggerStore.lastError" class="run-error"><strong>任务没有完成</strong><span>{{ taggerStore.lastError }}</span></div>
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
      :tag-source="taggerStore.tagSource"
      :providers="taggerStore.providers"
      @close="settingsVisible = false"
      @update:model-value="taggerStore.activeModelPath = $event; taggerStore.persistSession()"
      @update:threshold="taggerStore.threshold = $event; taggerStore.persistSession()"
      @update:tag-source="taggerStore.tagSource = $event; taggerStore.persistSession()"
      @refresh="taggerStore.loadModels"
    />

    <TaggingPreviewDialog
      :visible="showTaggingDialog"
      :image-paths="taggerStore.queue.map((item) => item.path)"
      :model-path="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.path"
      :csv-path="taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.csvPath ?? null"
      :threshold="taggerStore.threshold"
      :providers="taggerStore.providers"
      @close="showTaggingDialog = false"
      @applied="taggerStore.persistSession()"
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
      @close="contextMenu = null"
    />
  </main>
</template>

<style scoped>
.tagger-page { height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 6px 10px 10px; color: var(--text-primary); overflow: hidden; }
.tagger-layout { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 12px; overflow: hidden; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.tagger-workspace { flex: 1; min-width: 320px; min-height: 0; display: flex; flex-direction: column; }
.tagger-preview__toolbar { height: 48px; flex: none; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 0 12px; border: 0; border-radius: 10px; background: linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.02)); }
.tagger-preview__toolbar > div { display: flex; align-items: center; gap: 8px; }
.tagger-preview__toolbar strong { max-width: 35vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 13px; }
.tagger-preview__toolbar span { color: var(--text-tertiary); font: 11px ui-monospace, monospace; }
.tagger-preview__toolbar button { height: 32px; padding: 0 12px; border: 1px solid rgba(255,255,255,.07); border-radius: 8px; background: rgba(255,255,255,.025); color: var(--text-tertiary); cursor: pointer; font-size: 11px; }
.tagger-preview__toolbar button:disabled { opacity: .25; }
.tagger-preview { position: relative; flex: 1; min-height: 0; display: flex; overflow: auto; border-radius: 14px; background: radial-gradient(circle at center,#201d24,#121116 72%); }
.tagger-preview::before { content: ''; position: absolute; inset: 0; opacity: .11; background-image: linear-gradient(45deg,#2b2730 25%,transparent 25%),linear-gradient(-45deg,#2b2730 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2b2730 75%),linear-gradient(-45deg,transparent 75%,#2b2730 75%); background-size: 20px 20px; background-position: 0 0,0 10px,10px -10px,-10px 0; }
.preview-canvas { position: relative; z-index: 1; margin: auto; flex: none; display: flex; align-items: center; justify-content: center; }
.preview-canvas img { display: block; width: 100%; height: 100%; object-fit: contain; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
.preview-loading { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--text-tertiary); font-size: 12px; }
.preview-loading span { width: 11px; height: 11px; border: 2px solid rgba(255,255,255,.08); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin .75s linear infinite; }
.preview-empty { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-tertiary); text-align: center; }
.preview-empty strong { color: var(--text-secondary); font-size: 16px; }
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
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 10px;
  background: rgba(17,15,21,.74);
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 24px rgba(0,0,0,.3);
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
.run-error { display: flex; gap: 8px; padding: 8px 10px; border: 1px solid rgba(255,137,117,.13); border-radius: 8px; background: rgba(255,137,117,.05); font-size: 11px; }
.run-error strong { color: #ff9a86; }
.run-error span { color: var(--text-tertiary); }
.tagger-toolbar { height: 48px; flex: 0 0 48px; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 0 2px; }
.tagger-toolbar__status { min-width: 0; display: flex; align-items: baseline; gap: 7px; }
.tagger-toolbar__status strong { color: var(--text-primary); font-size: 15px; }
.tagger-toolbar__status span { color: var(--text-tertiary); font-size: 11px; white-space: nowrap; }
.tagger-toolbar__model { margin-left: auto; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tagger-toolbar__actions { display: flex; gap: 6px; }
.tagger-toolbar button { height: 36px; padding: 0 14px; border: 1px solid rgba(255,255,255,.075); border-radius: 9px; background: rgba(255,255,255,.025); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 12px; }
.tagger-toolbar button.primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
.tagger-toolbar button.stop { border-color: rgba(255,137,117,.2); color: #ff9a86; }
.tagger-toolbar button:disabled { opacity: .38; cursor: not-allowed; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1200px) {
  .tagger-layout { gap: 10px; }
  .tagger-workspace { min-width: 280px; }
}
@media (max-width: 760px) {
  .tagger-page { padding: 8px; overflow-x: hidden; }
  .tagger-layout { gap: 8px; }
  .tagger-toolbar__model, .tagger-toolbar__actions .quiet { display: none; }
}
</style>

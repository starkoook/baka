<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import TagQueue from '@/components/tagger/TagQueue.vue'
import TagEditor from '@/components/tagger/TagEditor.vue'
import TagRunProgress from '@/components/tagger/TagRunProgress.vue'
import TagSettingsPanel from '@/components/tagger/TagSettingsPanel.vue'
import type { TagResult } from '@/stores/tagger'
import { useTaggerStore } from '@/stores/tagger'
import { useGalleryStore } from '@/stores/gallery'

const router = useRouter()
const taggerStore = useTaggerStore()
const galleryStore = useGalleryStore()
const settingsVisible = ref(false)
const previewSrc = ref('')
const previewLoading = ref(false)
const saving = ref(false)
const queueCollapsed = ref(false)

const sourceLabel = computed(() => {
  const context = taggerStore.returnContext
  if (!context) return '临时导入'
  if (context.kind === 'dataset') return '来自数据集'
  if (context.kind === 'root') return '来自图库文件夹'
  return '来自全部图片'
})

const canStart = computed(() => taggerStore.queue.length > 0 && !!taggerStore.activeModelPath && taggerStore.phase !== 'running' && taggerStore.phase !== 'stopping')
const currentFilename = computed(() => taggerStore.currentItem?.path.split(/[/\\]/).pop() || '')
const phaseLabel = computed(() => ({ setup: '准备标注', running: '自动标注中', stopping: '正在停止', review: '人工校对' }[taggerStore.phase]))
const selectedModelLabel = computed(() => taggerStore.models.find((model) => model.path === taggerStore.activeModelPath)?.name || '未选择模型')

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
})
</script>

<template>
  <main class="tagger-page">
    <header class="tagger-toolbar">
      <div class="tagger-toolbar__status">
        <strong>标注</strong>
        <span>{{ phaseLabel }} · {{ taggerStore.completedCount }} / {{ taggerStore.queue.length }}</span>
        <small>{{ sourceLabel }}</small>
      </div>
      <button class="tagger-toolbar__model" @click="settingsVisible = true">模型：{{ selectedModelLabel }}</button>
      <div class="tagger-toolbar__actions">
        <button v-if="taggerStore.returnContext" class="quiet" @click="returnToGallery">← 返回图库原位置</button>
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
        @toggle-collapsed="queueCollapsed = !queueCollapsed"
      />

      <div class="tagger-workspace">
        <div class="tagger-preview__toolbar">
          <div><strong>{{ currentFilename || '没有选择图片' }}</strong><span v-if="taggerStore.currentItem">{{ taggerStore.currentIndex + 1 }} / {{ taggerStore.queue.length }}</span></div>
          <div><button :disabled="taggerStore.currentIndex <= 0" @click="previousImage">← 上一张</button><button :disabled="taggerStore.currentIndex >= taggerStore.queue.length - 1" @click="nextImage">下一张 →</button></div>
        </div>

        <div class="tagger-preview">
          <div v-if="previewLoading" class="preview-loading"><span></span>正在读取图片</div>
          <img v-else-if="previewSrc" :src="previewSrc" :alt="currentFilename" />
          <div v-else class="preview-empty">
            <strong>{{ taggerStore.queue.length ? '图片无法预览' : '先准备一批图片吧' }}</strong>
            <span>{{ taggerStore.queue.length ? '文件可能被移动了，可以从队列中重试或重新添加。' : '从图库选择图片送过来，或者点击左下角继续添加。' }}</span>
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
  </main>
</template>

<style scoped>
.tagger-page { height: calc(100vh - 72px); min-height: 560px; display: flex; flex-direction: column; padding: 10px 14px 14px; color: var(--text-primary); overflow: hidden; }
.tagger-layout { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 14px; overflow: hidden; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.tagger-workspace { flex: 1; min-width: 320px; min-height: 0; display: flex; flex-direction: column; }
.tagger-preview__toolbar { height: 44px; flex: none; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 0 10px; border: 0; border-radius: 10px; background: linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.02)); }
.tagger-preview__toolbar > div { display: flex; align-items: center; gap: 8px; }
.tagger-preview__toolbar strong { max-width: 35vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 10px; }
.tagger-preview__toolbar span { color: var(--text-tertiary); font: 8px ui-monospace, monospace; }
.tagger-preview__toolbar button { height: 29px; padding: 0 9px; border: 1px solid rgba(255,255,255,.07); border-radius: 7px; background: rgba(255,255,255,.025); color: var(--text-tertiary); cursor: pointer; font-size: 8px; }
.tagger-preview__toolbar button:disabled { opacity: .25; }
.tagger-preview { flex: 1; min-height: 0; position: relative; display: grid; place-items: center; overflow: hidden; border-radius: 14px; background: radial-gradient(circle at center,#201d24,#121116 72%); }
.tagger-preview::before { content: ''; position: absolute; inset: 0; opacity: .11; background-image: linear-gradient(45deg,#2b2730 25%,transparent 25%),linear-gradient(-45deg,#2b2730 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2b2730 75%),linear-gradient(-45deg,transparent 75%,#2b2730 75%); background-size: 20px 20px; background-position: 0 0,0 10px,10px -10px,-10px 0; }
.tagger-preview img { position: relative; max-width: calc(100% - 46px); max-height: calc(100% - 40px); object-fit: contain; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
.preview-loading { z-index: 1; display: flex; gap: 7px; color: var(--text-tertiary); font-size: 9px; }
.preview-loading span { width: 11px; height: 11px; border: 2px solid rgba(255,255,255,.08); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin .75s linear infinite; }
.preview-empty { z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--text-tertiary); text-align: center; }
.preview-empty strong { color: var(--text-secondary); font-size: 13px; }
.preview-empty > span { max-width: 280px; font-size: 9px; line-height: 1.6; }
.tagger-preview__progress { flex: none; margin-top: 8px; padding: 6px 9px; border: 0; border-radius: 10px; background: linear-gradient(135deg, rgba(255,255,255,.045), rgba(255,255,255,.018)); }
.run-summary { height: 28px; display: flex; align-items: center; gap: 10px; color: var(--text-tertiary); font-size: 8px; }
.run-summary span + span::before { content: '·'; margin-right: 10px; color: rgba(255,255,255,.15); }
.run-error { display: flex; gap: 8px; padding: 8px 10px; border: 1px solid rgba(255,137,117,.13); border-radius: 8px; background: rgba(255,137,117,.05); font-size: 8px; }
.run-error strong { color: #ff9a86; }.run-error span { color: var(--text-tertiary); }
.tagger-toolbar { height: 44px; flex: 0 0 44px; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 0 4px; }
.tagger-toolbar__status { min-width: 0; display: flex; align-items: baseline; gap: 7px; }
.tagger-toolbar__status strong { color: var(--text-primary); font-size: 13px; }
.tagger-toolbar__status span, .tagger-toolbar__status small { color: var(--text-tertiary); font-size: 8px; white-space: nowrap; }
.tagger-toolbar__status small::before { content: '·'; margin-right: 7px; color: rgba(255,255,255,.16); }
.tagger-toolbar__model { margin-left: auto; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tagger-toolbar__actions { display: flex; gap: 6px; }
.tagger-toolbar button { height: 30px; padding: 0 9px; border: 1px solid rgba(255,255,255,.075); border-radius: 8px; background: rgba(255,255,255,.025); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 8px; }
.tagger-toolbar button.primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
.tagger-toolbar button.stop { border-color: rgba(255,137,117,.2); color: #ff9a86; }
.tagger-toolbar button:disabled { opacity: .38; cursor: not-allowed; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1200px) { .tagger-layout { gap: 10px; }.tagger-workspace { min-width: 280px; } }
@media (max-width: 760px) { .tagger-page { padding: 8px; overflow-x: hidden; }.tagger-layout { gap: 8px; }.tagger-toolbar__status small, .tagger-toolbar__model, .tagger-toolbar__actions .quiet { display: none; } }
/* Legacy declarations below are overridden above while this view transitions to the seamless layout. */
.tagger-page { height: calc(100vh - 72px); min-height: 560px; display: flex; flex-direction: column; padding: 14px 18px 18px; color: var(--text-primary); overflow: hidden; }.tagger-header { height: 62px; flex: none; display: flex; align-items: center; gap: 18px; padding: 0 4px; }.tagger-title { display: flex; align-items: center; gap: 10px; }.tagger-title__mark { width: 3px; height: 34px; border-radius: 3px; background: linear-gradient(var(--accent-primary),#ffc184); box-shadow: 0 0 16px rgba(var(--accent-primary-rgb),.35); }.tagger-title p { margin: 0 0 2px; color: var(--accent-primary); font-size: 8px; font-weight: 750; letter-spacing: .16em; }.tagger-title h1 { margin: 0; font-size: 20px; }.phase-badge { padding: 4px 7px; border-radius: 999px; background: rgba(120,200,255,.08); color: #78c8ff; font-size: 8px; }.tagger-header__summary { display: flex; gap: 8px; margin-left: auto; color: var(--text-tertiary); font-size: 9px; }.tagger-header__summary strong { color: var(--text-secondary); }.tagger-header__actions { display: flex; gap: 7px; }.tagger-header__actions button { height: 34px; padding: 0 12px; border: 1px solid rgba(255,255,255,.075); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 9px; }.tagger-header__actions .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }.tagger-header__actions .stop { border-color: rgba(255,137,117,.2); color: #ff9a86; }.tagger-header__actions button:disabled { opacity: .38; cursor: not-allowed; }.tagger-shell { flex: 1; min-height: 0; display: flex; overflow: hidden; border: 1px solid rgba(255,255,255,.065); border-radius: 14px; background: rgba(19,17,23,.52); box-shadow: 0 18px 55px rgba(0,0,0,.18); }.tagger-workspace { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }.tagger-preview__toolbar { height: 59px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; border-bottom: 1px solid rgba(255,255,255,.055); }.tagger-preview__toolbar > div { display: flex; align-items: center; gap: 8px; }.tagger-preview__toolbar strong { max-width: 35vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 10px; }.tagger-preview__toolbar span { color: var(--text-tertiary); font: 8px ui-monospace, monospace; }.tagger-preview__toolbar button { height: 29px; padding: 0 9px; border: 1px solid rgba(255,255,255,.07); border-radius: 7px; background: rgba(255,255,255,.025); color: var(--text-tertiary); cursor: pointer; font-size: 8px; }.tagger-preview__toolbar button:disabled { opacity: .25; }.tagger-preview { flex: 1; min-height: 0; position: relative; display: grid; place-items: center; overflow: hidden; background: radial-gradient(circle at center,#201d24,#121116 72%); }.tagger-preview::before { content: ''; position: absolute; inset: 0; opacity: .11; background-image: linear-gradient(45deg,#2b2730 25%,transparent 25%),linear-gradient(-45deg,#2b2730 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2b2730 75%),linear-gradient(-45deg,transparent 75%,#2b2730 75%); background-size: 20px 20px; background-position: 0 0,0 10px,10px -10px,-10px 0; }.tagger-preview img { position: relative; max-width: calc(100% - 46px); max-height: calc(100% - 40px); object-fit: contain; box-shadow: 0 20px 60px rgba(0,0,0,.35); }.preview-loading { z-index: 1; display: flex; gap: 7px; color: var(--text-tertiary); font-size: 9px; }.preview-loading span { width: 11px; height: 11px; border: 2px solid rgba(255,255,255,.08); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin .75s linear infinite; }.preview-empty { z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--text-tertiary); text-align: center; }.preview-empty strong { color: var(--text-secondary); font-size: 13px; }.preview-empty > span { max-width: 280px; font-size: 9px; line-height: 1.6; }.preview-mascot { width: 180px; height: 150px; overflow: hidden; transform: scale(.7); transform-origin: center bottom; margin-bottom: -30px; }.tagger-preview__progress { flex: none; padding: 9px 12px; border-top: 1px solid rgba(255,255,255,.055); background: rgba(10,9,13,.1); }.run-summary { height: 28px; display: flex; align-items: center; gap: 10px; color: var(--text-tertiary); font-size: 8px; }.run-summary span + span::before { content: '·'; margin-right: 10px; color: rgba(255,255,255,.15); }.run-error { display: flex; gap: 8px; padding: 8px 10px; border: 1px solid rgba(255,137,117,.13); border-radius: 8px; background: rgba(255,137,117,.05); font-size: 8px; }.run-error strong { color: #ff9a86; }.run-error span { color: var(--text-tertiary); }@keyframes spin { to { transform: rotate(360deg); } }@media (max-width: 760px) { .tagger-page { padding: 8px; }.tagger-header { height: 54px; }.tagger-header__summary, .tagger-header__actions .quiet:first-child { display: none; }.tagger-shell { border-radius: 10px; } }
.tagger-page { padding: 10px 14px 14px; }
.tagger-toolbar { height: 44px; flex: 0 0 44px; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 0 4px; }
.tagger-toolbar__status { min-width: 0; display: flex; align-items: baseline; gap: 7px; }
.tagger-toolbar__status strong { color: var(--text-primary); font-size: 13px; }
.tagger-toolbar__status span, .tagger-toolbar__status small { color: var(--text-tertiary); font-size: 8px; white-space: nowrap; }
.tagger-toolbar__status small::before { content: '·'; margin-right: 7px; color: rgba(255,255,255,.16); }
.tagger-toolbar__model { margin-left: auto; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tagger-toolbar__actions { display: flex; gap: 6px; }
.tagger-toolbar button { height: 30px; padding: 0 9px; border: 1px solid rgba(255,255,255,.075); border-radius: 8px; background: rgba(255,255,255,.025); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 8px; }
.tagger-toolbar button.primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
.tagger-toolbar button.stop { border-color: rgba(255,137,117,.2); color: #ff9a86; }
.tagger-toolbar button:disabled { opacity: .38; cursor: not-allowed; }
.tagger-preview__toolbar { height: 44px; }
.tagger-preview__progress { padding: 6px 9px; }
@media (max-width: 760px) { .tagger-toolbar__status small, .tagger-toolbar__model, .tagger-toolbar__actions .quiet { display: none; } }
.tagger-workspace { min-width: 320px; }
.tagger-preview__toolbar { height: 44px; margin-bottom: 8px; padding: 0 10px; border: 0; border-radius: 10px; background: linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.02)); }
.tagger-preview { border-radius: 14px; }
.tagger-preview__progress { margin-top: 8px; padding: 6px 9px; border: 0; border-radius: 10px; background: linear-gradient(135deg, rgba(255,255,255,.045), rgba(255,255,255,.018)); }
@media (max-width: 1200px) { .tagger-layout { gap: 10px; }.tagger-workspace { min-width: 280px; } }
@media (max-width: 760px) { .tagger-page { padding: 8px; overflow-x: hidden; }.tagger-layout { gap: 8px; } }
</style>

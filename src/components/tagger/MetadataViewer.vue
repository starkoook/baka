<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildMetadataSections, formatAllMetadata } from '@/features/gallery/metadata-sections'

type ViewerTab = 'overview' | 'generation' | 'raw' | 'tags'

const props = defineProps<{
  visible: boolean
  images: GalleryImage[]
  imageIndex: number
  metadata: SDMetadata
  tags: TagInfo[]
  imageSrc: string
  loading?: boolean
  readOnly?: boolean
}>()

const emit = defineEmits<{
  close: []
  previous: []
  next: []
  sendToTagger: []
  reveal: []
  saveTags: [tags: { tag: string; confidence?: number; source?: string; weight?: number }[]]
}>()

const activeTab = ref<ViewerTab>('overview')
const zoomMode = ref<'fit' | 'original'>('fit')
const editableTags = ref<{ tag: string; confidence?: number; source?: string; weight?: number }[]>([])
const tagInput = ref('')
const copiedKey = ref('')
const historyItems = ref<HistoryVersion[]>([])

const image = computed(() => props.images[props.imageIndex] ?? null)
const txtPath = computed(() => image.value ? image.value.path.replace(/\.[^.]+$/, '') + '.txt' : '')
const sections = computed(() => buildMetadataSections(props.metadata, props.tags))
const hasGenerationInfo = computed(() => sections.value.generation.length > 0)
const hasRawMetadata = computed(() => sections.value.raw.length > 0)

watch(() => props.tags, (tags) => {
  editableTags.value = tags.map((tag) => ({ tag: tag.tag, confidence: tag.confidence, source: tag.source, weight: tag.weight }))
}, { immediate: true, deep: true })

watch(() => props.imageIndex, () => {
  zoomMode.value = 'fit'
  tagInput.value = ''
  loadHistory()
})

watch(() => props.readOnly, (readOnly) => {
  if (readOnly) activeTab.value = 'overview'
})

watch(txtPath, loadHistory, { immediate: true })

function toggleZoom() {
  zoomMode.value = zoomMode.value === 'fit' ? 'original' : 'fit'
}

function onKeydown(event: KeyboardEvent) {
  if (!props.visible) return
  if (event.key === 'ArrowLeft') emit('previous')
  if (event.key === 'ArrowRight') emit('next')
  if (event.key === 'Escape') emit('close')
}

function addTag() {
  if (props.readOnly) return
  const tag = tagInput.value.trim()
  if (!tag || editableTags.value.some((item) => item.tag === tag)) return
  editableTags.value.push({ tag, source: 'manual' })
  tagInput.value = ''
}

function removeTag(tag: string) {
  if (props.readOnly) return
  editableTags.value = editableTags.value.filter((item) => item.tag !== tag)
}

async function copyText(key: string, text: string) {
  await navigator.clipboard.writeText(text)
  copiedKey.value = key
  window.setTimeout(() => { if (copiedKey.value === key) copiedKey.value = '' }, 1200)
}

function formatSize(bytes: number) {
  if (!bytes) return '未知'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function loadHistory() {
  historyItems.value = []
  if (!window.historyAPI || !txtPath.value) return
  const result = await window.historyAPI.list(txtPath.value)
  if (result.success && result.data) historyItems.value = result.data
}

async function restoreHistory(id: number) {
  if (!window.historyAPI) return
  const result = await window.historyAPI.restore(id)
  if (result.success) await loadHistory()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && image" class="metadata-viewer" role="dialog" aria-modal="true" aria-label="图片元数据查看器">
      <header class="metadata-viewer__header">
        <div class="viewer-file">
          <button class="icon-button" aria-label="关闭" @click="emit('close')"><svg viewBox="0 0 20 20"><path d="m13 4-6 6 6 6"/></svg></button>
          <div><strong>{{ image.filename }}</strong><span>{{ image.width }} × {{ image.height }} · {{ formatSize(image.file_size) }}<i v-if="readOnly" class="viewer-temporary">临时查看</i></span></div>
        </div>
        <div class="viewer-actions">
          <button @click="emit('reveal')">打开文件位置</button>
          <button v-if="!readOnly" class="primary" @click="emit('sendToTagger')">送去标注</button>
          <button class="icon-button" aria-label="关闭" @click="emit('close')"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
        </div>
      </header>

      <div class="metadata-viewer__body">
        <section class="metadata-viewer__image-stage" @dblclick="toggleZoom">
          <img v-if="imageSrc && !loading" class="viewer-blur-bg" :src="imageSrc" alt="" aria-hidden="true" />
          <div v-if="loading" class="viewer-loading"><span></span>正在读取原图</div>
          <img v-else-if="imageSrc" :src="imageSrc" :alt="image.filename" :class="`zoom-${zoomMode}`" draggable="false" />
          <button class="nav-button nav-button--left" :disabled="imageIndex <= 0" aria-label="上一张" @click="emit('previous')">‹</button>
          <button class="nav-button nav-button--right" :disabled="imageIndex >= images.length - 1" aria-label="下一张" @click="emit('next')">›</button>
          <button class="zoom-button" @click="toggleZoom">{{ zoomMode === 'fit' ? '查看原始尺寸' : '适合窗口' }}</button>
          <span class="viewer-counter">{{ imageIndex + 1 }} / {{ images.length }}</span>
        </section>

        <aside class="metadata-viewer__panel">
          <nav class="viewer-tabs">
            <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">详情</button>
            <button :class="{ active: activeTab === 'generation' }" @click="activeTab = 'generation'">生成参数</button>
            <button v-if="!readOnly" :class="{ active: activeTab === 'tags' }" @click="activeTab = 'tags'">标签</button>
          </nav>

          <div class="viewer-panel-scroll">
            <section v-if="activeTab === 'overview'" class="viewer-section">
              <div class="section-title"><div><p>OVERVIEW</p><h2>图片信息</h2></div><button v-if="sections.overview.length" @click="copyText('all', formatAllMetadata(metadata))">{{ copiedKey === 'all' ? '已复制' : '复制全部' }}</button></div>
              <div class="file-facts">
                <div><span>文件名</span><strong>{{ image.filename }}</strong></div>
                <div><span>尺寸</span><strong>{{ image.width }} × {{ image.height }}</strong></div>
                <div><span>文件大小</span><strong>{{ formatSize(image.file_size) }}</strong></div>
              </div>
              <div v-if="sections.overview.length" class="metadata-fields">
                <div
                  v-for="field in sections.overview"
                  :key="field.key"
                  class="metadata-field"
                  :class="{ 'metadata-field--multiline': field.key === 'lora' }"
                ><span>{{ field.label }}</span><strong>{{ field.value }}</strong></div>
              </div>
              <div v-if="historyItems.length" class="history-list">
                <div class="history-title">历史版本</div>
                <div v-for="item in historyItems" :key="item.id" class="history-item">
                  <span>{{ item.created_at }}</span>
                  <button @click="restoreHistory(item.id)">恢复</button>
                </div>
              </div>
              <div v-else class="viewer-empty"><strong>没有生成参数</strong><span>这张图片只包含基础文件信息，不会显示空参数卡片。</span></div>
            </section>

            <section v-else-if="activeTab === 'generation'" class="viewer-section">
              <div class="section-title"><div><p>GENERATION</p><h2>生成信息</h2></div></div>
              <template v-if="hasGenerationInfo">
                <article v-for="field in sections.generation" :key="field.key" class="prompt-block">
                  <div><strong>{{ field.label }}</strong><button @click="copyText(field.key, String(field.value))">{{ copiedKey === field.key ? '已复制' : '复制' }}</button></div>
                  <p>{{ field.value }}</p>
                </article>
              </template>
              <div v-else class="viewer-empty"><strong>没有提示词信息</strong><span>图片中未检测到正向或反向提示词。</span></div>
            </section>

            <section v-else-if="activeTab === 'raw'" class="viewer-section">
              <div class="section-title"><div><p>RAW METADATA</p><h2>原始元数据</h2></div><button v-if="hasRawMetadata" @click="copyText('raw', String(sections.raw[0].value))">{{ copiedKey === 'raw' ? '已复制' : '复制全部' }}</button></div>
              <pre v-if="hasRawMetadata" class="raw-metadata">{{ sections.raw[0].value }}</pre>
              <div v-else class="viewer-empty"><strong>没有原始元数据</strong><span>图片中未检测到可保留的嵌入字段。</span></div>
            </section>

            <section v-else class="viewer-section">
              <div class="section-title"><div><p>TAGS</p><h2>图片标签</h2></div><span>{{ editableTags.length }} 个</span></div>
              <div class="tag-editor-input"><input v-model="tagInput" placeholder="输入标签，回车添加" @keydown.enter.prevent="addTag" /><button :disabled="!tagInput.trim()" @click="addTag">添加</button></div>
              <div v-if="editableTags.length" class="editable-tags"><button v-for="tag in editableTags" :key="tag.tag" title="点击删除" @click="removeTag(tag.tag)">{{ tag.tag }}<span>×</span></button></div>
              <div v-else class="viewer-empty"><strong>还没有标签</strong><span>可以在上方手动添加，或送去标注工作台自动识别。</span></div>
              <button class="save-tags" @click="emit('saveTags', editableTags)">保存标签</button>
              <button class="send-link" @click="emit('sendToTagger')">送去标注工作台进行完整校对 →</button>
            </section>
          </div>
        </aside>
      </div>

      <footer class="metadata-viewer__footer">
        <span :title="image.path">{{ image.path }}</span>
        <div><kbd>←</kbd><kbd>→</kbd> 切换图片　<kbd>双击</kbd> 原始尺寸　<kbd>Esc</kbd> 关闭</div>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.metadata-viewer { position: fixed; inset: 0; z-index: 600; display: flex; flex-direction: column; background: #111015; color: var(--text-primary); }
.metadata-viewer__header { height: 58px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; border-bottom: 1px solid rgba(255,255,255,.07); background: rgba(18,16,22,.96); }.viewer-file, .viewer-actions { display: flex; align-items: center; gap: 9px; }.viewer-file div { display: grid; gap: 2px; }.viewer-file strong { max-width: 50vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }.viewer-file span { color: var(--text-tertiary); font-size: 8px; }.viewer-actions button { height: 32px; padding: 0 11px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 9px; }.viewer-actions .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }.icon-button { width: 32px; padding: 0 !important; display: grid; place-items: center; }.icon-button svg { width: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; }
.viewer-temporary { margin-left: 7px; padding: 2px 5px; border-radius: 999px; background: rgba(var(--accent-primary-rgb),.1); color: var(--accent-primary); font-style: normal; }
.metadata-viewer__body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); }.metadata-viewer__image-stage { position: relative; min-width: 0; min-height: 0; display: grid; place-items: center; overflow: auto; background: radial-gradient(circle at center, #1c1a21, #0d0c10 72%); }.metadata-viewer__image-stage::before { content: ''; position: absolute; inset: 0; opacity: .16; pointer-events: none; background-image: linear-gradient(45deg,#25222a 25%,transparent 25%),linear-gradient(-45deg,#25222a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#25222a 75%),linear-gradient(-45deg,transparent 75%,#25222a 75%); background-size: 20px 20px; background-position: 0 0,0 10px,10px -10px,-10px 0; }.metadata-viewer__image-stage img { position: relative; z-index: 1; display: block; }.metadata-viewer__image-stage img.zoom-fit { max-width: calc(100% - 80px); max-height: calc(100% - 70px); object-fit: contain; box-shadow: 0 24px 70px rgba(0,0,0,.4); }.metadata-viewer__image-stage img.zoom-original { max-width: none; max-height: none; margin: 50px; }.nav-button { position: fixed; z-index: 3; top: 50%; width: 40px; height: 58px; border: 1px solid rgba(255,255,255,.09); border-radius: 10px; background: rgba(13,12,16,.68); color: white; cursor: pointer; font-size: 27px; backdrop-filter: blur(8px); }.nav-button:disabled { opacity: .18; cursor: default; }.nav-button--left { left: 18px; }.nav-button--right { left: calc(66.666% - 56px); }.zoom-button { position: absolute; z-index: 3; right: 14px; bottom: 13px; height: 30px; padding: 0 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 8px; background: rgba(13,12,16,.76); color: var(--text-secondary); cursor: pointer; font-size: 9px; }.viewer-counter { position: absolute; z-index: 3; left: 14px; bottom: 16px; color: rgba(255,255,255,.55); font: 9px ui-monospace, monospace; }.viewer-loading { z-index: 2; display: flex; gap: 7px; color: var(--text-tertiary); font-size: 10px; }.viewer-loading span { width: 11px; height: 11px; border: 2px solid rgba(255,255,255,.1); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin .7s linear infinite; }
.metadata-viewer__panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; border-left: 1px solid rgba(255,255,255,.07); background: #18161c; }.viewer-tabs { height: 47px; flex: none; display: flex; padding: 7px 10px 0; border-bottom: 1px solid rgba(255,255,255,.06); }.viewer-tabs button { position: relative; padding: 0 13px; border: 0; background: transparent; color: var(--text-tertiary); cursor: pointer; font: inherit; font-size: 10px; }.viewer-tabs button.active { color: var(--text-primary); }.viewer-tabs button.active::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--accent-primary); }.viewer-panel-scroll { flex: 1; min-height: 0; overflow: auto; }.viewer-section { padding: 20px; }.section-title { display: flex; align-items: end; justify-content: space-between; margin-bottom: 17px; }.section-title p { margin: 0 0 3px; color: var(--accent-primary); font-size: 7px; font-weight: 750; letter-spacing: .17em; }.section-title h2 { margin: 0; font-size: 16px; }.section-title button, .section-title span { border: 0; background: transparent; color: var(--text-tertiary); font-size: 8px; }.section-title button { cursor: pointer; }.file-facts, .metadata-fields { display: grid; gap: 1px; overflow: hidden; border: 1px solid rgba(255,255,255,.06); border-radius: 10px; background: rgba(255,255,255,.05); }.file-facts div, .metadata-field { display: flex; justify-content: space-between; gap: 12px; padding: 10px 11px; background: #1b191f; font-size: 9px; }.file-facts span, .metadata-field span { color: var(--text-tertiary); }.file-facts strong, .metadata-field strong { min-width: 0; overflow-wrap: anywhere; color: var(--text-secondary); text-align: right; font-weight: 550; }.metadata-fields { margin-top: 12px; }.viewer-empty { min-height: 145px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; padding: 20px; color: var(--text-tertiary); text-align: center; }.viewer-empty strong { color: var(--text-secondary); font-size: 12px; }.viewer-empty span { max-width: 250px; font-size: 9px; line-height: 1.7; }.prompt-block { margin-bottom: 12px; padding: 13px; border: 1px solid rgba(255,255,255,.06); border-radius: 10px; background: rgba(255,255,255,.02); }.prompt-block div { display: flex; justify-content: space-between; }.prompt-block strong { color: var(--text-secondary); font-size: 10px; }.prompt-block button { border: 0; background: transparent; color: var(--accent-primary); cursor: pointer; font-size: 8px; }.prompt-block p { margin: 10px 0 0; color: var(--text-tertiary); font-size: 10px; line-height: 1.75; white-space: pre-wrap; }.tag-editor-input { display: flex; gap: 6px; }.tag-editor-input input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-primary); outline: none; font: inherit; font-size: 10px; }.tag-editor-input button { padding: 0 11px; border: 0; border-radius: 8px; background: rgba(var(--accent-primary-rgb),.13); color: var(--accent-primary); cursor: pointer; font-size: 9px; }.editable-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 13px; }.editable-tags button { padding: 5px 7px 5px 9px; border: 1px solid rgba(var(--accent-primary-rgb),.13); border-radius: 999px; background: rgba(var(--accent-primary-rgb),.07); color: var(--text-secondary); cursor: pointer; font-size: 9px; }.editable-tags span { margin-left: 5px; color: var(--text-tertiary); }.save-tags { width: 100%; height: 36px; margin-top: 18px; border: 0; border-radius: 8px; background: var(--accent-primary); color: white; cursor: pointer; font: inherit; font-size: 10px; font-weight: 700; }.send-link { width: 100%; margin-top: 10px; border: 0; background: transparent; color: var(--text-tertiary); cursor: pointer; font-size: 9px; }
.raw-metadata { margin: 0; padding: 13px; overflow: auto; border: 1px solid rgba(255,255,255,.06); border-radius: 10px; background: rgba(0,0,0,.18); color: var(--text-tertiary); font: 9px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.metadata-viewer__footer { height: 31px; flex: none; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 0 14px; border-top: 1px solid rgba(255,255,255,.06); background: #131116; color: var(--text-tertiary); font-size: 8px; }.metadata-viewer__footer > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.metadata-viewer__footer div { white-space: nowrap; }.metadata-viewer__footer kbd { padding: 1px 4px; border: 1px solid rgba(255,255,255,.09); border-radius: 3px; background: rgba(255,255,255,.03); font: inherit; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 850px) { .metadata-viewer__body { grid-template-columns: 1fr; grid-template-rows: minmax(280px, 56%) minmax(0, 44%); }.metadata-viewer__panel { border-left: 0; border-top: 1px solid rgba(255,255,255,.07); }.nav-button { position: absolute; }.nav-button--right { left: auto; right: 14px; }.viewer-actions > button:not(.primary):not(.icon-button) { display: none; }.metadata-viewer__footer { display: none; } }
.metadata-field--multiline { align-items: flex-start; }
.metadata-field--multiline strong { white-space: pre-line; line-height: 1.6; }
.history-list { margin-top: 12px; padding: 11px; border: 1px solid rgba(255,255,255,.06); border-radius: 10px; background: rgba(255,255,255,.02); }.history-title { margin-bottom: 8px; color: var(--text-secondary); font-size: 9px; }.history-item { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-top: 1px solid rgba(255,255,255,.05); font-size: 8px; }.history-item span { color: var(--text-tertiary); }.history-item button { border: 0; background: transparent; color: var(--accent-primary); cursor: pointer; font: inherit; font-size: 8px; }
@media (prefers-reduced-motion: reduce) { .viewer-loading span { animation-duration: 1.8s; } }
.viewer-blur-bg { position: absolute !important; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(28px) brightness(.48); transform: scale(1.18); opacity: .8; z-index: 0 !important; pointer-events: none; }
.metadata-viewer__image-stage img.zoom-fit { max-width: calc(100% - 60px) !important; max-height: calc(100% - 54px) !important; }
</style>

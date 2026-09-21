<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { buildMetadataSections, formatAllMetadata } from '@/features/gallery/metadata-sections'

type ViewerTab = 'overview' | 'generation' | 'raw' | 'tags'

const KV_TILT = [-1.4, 1.2, 0.8, -0.9, 1.4, -1.1]
const CHIP_TILT = [-2, 1.5, -1, 2, -1.5, 1]

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
const prevImage = computed(() => props.imageIndex > 0 ? props.images[props.imageIndex - 1] ?? null : null)
const nextImage = computed(() => props.imageIndex < props.images.length - 1 ? props.images[props.imageIndex + 1] ?? null : null)
const prevSrc = ref('')
const nextSrc = ref('')
const txtPath = computed(() => image.value ? image.value.path.replace(/\.[^.]+$/, '') + '.txt' : '')
const caption = computed(() => image.value ? image.value.filename.replace(/\.[^.]+$/, '') : '')
const sections = computed(() => buildMetadataSections(props.metadata, props.tags))
const hasGenerationInfo = computed(() => sections.value.generation.length > 0)
const hasRawMetadata = computed(() => sections.value.raw.length > 0)
const previewTags = computed(() => props.tags.slice(0, 8))

watch(() => props.tags, (tags) => {
  editableTags.value = tags.map((tag) => ({ tag: tag.tag, confidence: tag.confidence, source: tag.source, weight: tag.weight }))
}, { immediate: true, deep: true })

watch(() => props.imageIndex, () => {
  zoomMode.value = 'fit'
  tagInput.value = ''
  loadHistory()
})

watch(() => props.visible, (visible) => {
  if (visible) zoomMode.value = 'fit'
})

watch(() => props.readOnly, (readOnly) => {
  if (readOnly) activeTab.value = 'overview'
})

watch(txtPath, loadHistory, { immediate: true })

async function resolvePeekSrc(target: typeof prevSrc, peek: GalleryImage | null) {
  target.value = ''
  if (!peek || !window.galleryAPI) return
  try {
    const byId = peek.id > 0 ? await window.galleryAPI.getThumbnailUrl?.(peek.id) : null
    if (byId?.success && byId.data?.url) {
      target.value = byId.data.url
      return
    }
    const byPath = peek.path ? await window.galleryAPI.getThumbnailUrlByPath?.(peek.path) : null
    if (byPath?.success && byPath.data?.url) target.value = byPath.data.url
  } catch {
    /* 探出只用缩略图，失败就留空，绝不再解码整张原图 */
  }
}

watch(
  [prevImage, nextImage, () => props.visible],
  ([prev, next, visible]) => {
    if (!visible) {
      prevSrc.value = ''
      nextSrc.value = ''
      return
    }
    void resolvePeekSrc(prevSrc, prev)
    void resolvePeekSrc(nextSrc, next)
  },
  { immediate: true },
)

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

function copySize() {
  if (!image.value) return
  copyText('size', `${image.value.width} × ${image.value.height}`)
}

function copyCounter() {
  copyText('counter', `${props.imageIndex + 1} / ${props.images.length}`)
}

function formatSize(bytes: number) {
  if (!bytes) return '未知'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function tilt(list: number[], index: number) {
  return `${list[index % list.length]}deg`
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
    <div v-if="visible && image" class="metadata-viewer" :class="`is-${zoomMode}`" role="dialog" aria-modal="true" aria-label="图片元数据查看器">
      <div class="viewer-ambient" aria-hidden="true">
        <i class="viewer-ambient__blob viewer-ambient__blob--1" />
        <i class="viewer-ambient__blob viewer-ambient__blob--2" />
        <i class="viewer-ambient__blob viewer-ambient__blob--3" />
        <i class="viewer-ambient__dots" />
      </div>

      <header class="metadata-viewer__header">
        <button class="viewer-pill viewer-pill--icon" aria-label="关闭" @click="emit('close')">‹</button>
        <div class="viewer-pill viewer-pill--file">
          <b>{{ image.filename }}</b>
          <span>{{ image.width }} × {{ image.height }} · {{ formatSize(image.file_size) }}</span>
          <i v-if="readOnly" class="viewer-temporary">临时查看</i>
        </div>
        <span class="viewer-pill-grow" />
        <button class="btn btn-secondary btn-sm" @click="emit('reveal')">打开文件位置</button>
        <button v-if="!readOnly" class="btn btn-primary" @click="emit('sendToTagger')">送去标注</button>
        <button class="viewer-pill viewer-pill--icon" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <button
        v-if="prevImage && zoomMode === 'fit'"
        class="viewer-peek viewer-peek--prev"
        type="button"
        :title="prevImage.filename"
        aria-label="上一张"
        @click="emit('previous')"
      >
        <img :src="prevSrc" alt="" draggable="false" />
        <figcaption>上一张</figcaption>
      </button>

      <figure
        :class="['viewer-shot', 'metadata-viewer__image-stage', `is-${zoomMode}`]"
        @dblclick="toggleZoom"
      >
        <div v-if="loading" class="viewer-loading"><span></span>正在读取原图</div>
        <img
          v-else-if="imageSrc"
          :src="imageSrc"
          :alt="image.filename"
          :class="`zoom-${zoomMode}`"
          draggable="false"
        />
        <figcaption>{{ caption }}</figcaption>
      </figure>

      <button class="viewer-sticker viewer-sticker--count" type="button" @click="copyCounter">
        {{ imageIndex + 1 }} / <b>{{ images.length }}</b>
      </button>
      <button class="viewer-sticker viewer-sticker--size" type="button" @click="copySize">
        {{ copiedKey === 'size' ? '已复制' : '尺寸' }} <b>{{ image.width }}×{{ image.height }}</b>
      </button>
      <button class="viewer-sticker viewer-sticker--zoom" type="button" @click="toggleZoom">
        {{ zoomMode === 'fit' ? '查看原图' : '适合窗口' }}
      </button>

      <button
        v-if="nextImage && zoomMode === 'fit'"
        class="viewer-peek viewer-peek--next"
        type="button"
        :title="nextImage.filename"
        aria-label="下一张"
        @click="emit('next')"
      >
        <img :src="nextSrc" alt="" draggable="false" />
        <figcaption>下一张</figcaption>
      </button>

      <aside class="metadata-viewer__panel">
        <nav class="viewer-tabs">
          <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">详情</button>
          <button :class="{ active: activeTab === 'generation' }" @click="activeTab = 'generation'">生成参数</button>
          <button :class="{ active: activeTab === 'raw' }" @click="activeTab = 'raw'">原始</button>
          <button v-if="!readOnly" :class="{ active: activeTab === 'tags' }" @click="activeTab = 'tags'">标签</button>
        </nav>

        <div class="viewer-panel-scroll">
          <section v-if="activeTab === 'overview'" class="viewer-section">
            <p class="eyebrow">OVERVIEW</p>
            <div class="section-title">
              <h2>图片信息</h2>
              <button v-if="sections.overview.length" type="button" @click="copyText('all', formatAllMetadata(metadata))">
                {{ copiedKey === 'all' ? '已复制' : '复制全部' }}
              </button>
            </div>
            <div class="kv">
              <div style="--r: -1.4deg"><small>文件名</small><b>{{ image.filename }}</b></div>
              <div style="--r: 1.2deg"><small>尺寸</small><b>{{ image.width }} × {{ image.height }}</b></div>
              <div style="--r: 0.8deg"><small>文件大小</small><b>{{ formatSize(image.file_size) }}</b></div>
              <div
                v-for="field in sections.overview"
                :key="field.key"
                class="metadata-field"
                :class="{ 'metadata-field--multiline': field.key === 'lora' }"
                :style="{ '--r': tilt(KV_TILT, sections.overview.indexOf(field) + 3) }"
              >
                <small>{{ field.label }}</small>
                <b>{{ field.value }}</b>
              </div>
            </div>
            <div v-if="previewTags.length" class="chips">
              <button
                v-for="(tag, index) in previewTags"
                :key="tag.tag"
                class="chip"
                :class="{ lav: index % 3 === 1, mint: index % 3 === 2 }"
                :style="{ '--r': tilt(CHIP_TILT, index) }"
                type="button"
                @click="copyText(`chip-${tag.tag}`, tag.tag)"
              >{{ tag.tag }}</button>
            </div>
            <div v-if="historyItems.length" class="history-list">
              <div class="history-title">历史版本</div>
              <div v-for="item in historyItems" :key="item.id" class="history-item">
                <span>{{ item.created_at }}</span>
                <button type="button" @click="restoreHistory(item.id)">恢复</button>
              </div>
            </div>
            <div class="acts">
              <button v-if="!readOnly" class="btn btn-primary" type="button" @click="emit('sendToTagger')">送去标注</button>
              <button class="btn btn-secondary" type="button" @click="copyText('all', formatAllMetadata(metadata))">
                {{ copiedKey === 'all' ? '已复制' : '复制全部' }}
              </button>
            </div>
          </section>

          <section v-else-if="activeTab === 'generation'" class="viewer-section">
            <p class="eyebrow">GENERATION</p>
            <h2>生成信息</h2>
            <template v-if="hasGenerationInfo">
              <article v-for="field in sections.generation" :key="field.key" class="prompt-block">
                <div>
                  <strong>{{ field.label }}</strong>
                  <button type="button" @click="copyText(field.key, String(field.value))">
                    {{ copiedKey === field.key ? '已复制' : '复制' }}
                  </button>
                </div>
                <p>{{ field.value }}</p>
              </article>
            </template>
            <div v-else class="viewer-empty">
              <strong>没有提示词信息</strong>
              <span>图片中未检测到正向或反向提示词。</span>
            </div>
          </section>

          <section v-else-if="activeTab === 'raw'" class="viewer-section">
            <p class="eyebrow">RAW METADATA</p>
            <div class="section-title">
              <h2>原始元数据</h2>
              <button v-if="hasRawMetadata" type="button" @click="copyText('raw', String(sections.raw[0].value))">
                {{ copiedKey === 'raw' ? '已复制' : '复制全部' }}
              </button>
            </div>
            <pre v-if="hasRawMetadata" class="raw-metadata">{{ sections.raw[0].value }}</pre>
            <div v-else class="viewer-empty">
              <strong>没有原始元数据</strong>
              <span>图片中未检测到可保留的嵌入字段。</span>
            </div>
          </section>

          <section v-else class="viewer-section">
            <p class="eyebrow">TAGS</p>
            <div class="section-title">
              <h2>图片标签</h2>
              <span>{{ editableTags.length }} 个</span>
            </div>
            <div class="tag-editor-input">
              <input v-model="tagInput" class="form-input" placeholder="输入标签，回车添加" @keydown.enter.prevent="addTag" />
              <button class="btn btn-soft btn-sm" :disabled="!tagInput.trim()" @click="addTag">添加</button>
            </div>
            <div v-if="editableTags.length" class="editable-tags">
              <button
                v-for="(tag, index) in editableTags"
                :key="tag.tag"
                class="chip"
                :style="{ '--r': tilt(CHIP_TILT, index) }"
                title="点击删除"
                @click="removeTag(tag.tag)"
              >{{ tag.tag }}<span>×</span></button>
            </div>
            <div v-else class="viewer-empty">
              <strong>还没有标签</strong>
              <span>可以在上方手动添加，或送去标注工作台自动识别。</span>
            </div>
            <button class="btn btn-primary save-tags" @click="emit('saveTags', editableTags)">保存标签</button>
            <button class="send-link" @click="emit('sendToTagger')">送去标注工作台进行完整校对 →</button>
          </section>
        </div>
      </aside>

      <footer class="metadata-viewer__footer">
        <span :title="image.path">{{ image.path }}</span>
        <div><kbd>←</kbd><kbd>→</kbd> 切换　<kbd>双击</kbd> 查看原图　<kbd>Esc</kbd> 关闭</div>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.metadata-viewer {
  position: fixed;
  inset: 0;
  z-index: 600;
  background: var(--app-bg);
  color: var(--ink-primary);
  font-family: var(--font-sans);
  overflow: hidden;
}

.viewer-ambient,
.viewer-ambient__dots { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.viewer-ambient__blob { position: absolute; border-radius: 50%; }
.viewer-ambient__blob--1 { width: 640px; height: 640px; right: -160px; top: -220px; background: var(--blob-1); }
.viewer-ambient__blob--2 { width: 560px; height: 560px; left: -180px; bottom: -200px; background: var(--blob-2); }
.viewer-ambient__blob--3 { width: 420px; height: 420px; left: 42%; bottom: -180px; background: var(--blob-3); }
.viewer-ambient__dots {
  background-image: radial-gradient(var(--dots-color) 1px, transparent 1.2px);
  background-size: 26px 26px;
  -webkit-mask-image: radial-gradient(60% 60% at 50% 50%, #000 20%, transparent 100%);
  mask-image: radial-gradient(60% 60% at 50% 50%, #000 20%, transparent 100%);
}

.metadata-viewer__header {
  position: absolute;
  z-index: 6;
  left: 22px;
  right: 22px;
  top: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.viewer-pill {
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-primary);
  box-shadow: var(--surface-shadow);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-secondary);
  font: 700 13px var(--font-sans);
  cursor: pointer;
}
.viewer-pill--icon { width: 40px; padding: 0; justify-content: center; font-size: 20px; }
.viewer-pill--file { max-width: min(52vw, 640px); cursor: default; }
.viewer-pill--file b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-primary);
  font-weight: 800;
}
.viewer-pill--file span { color: var(--ink-tertiary); font: 600 11.5px var(--font-mono); flex: none; }
.viewer-pill-grow { flex: 1; }

.viewer-temporary {
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--brand-soft);
  color: var(--brand-hover);
  font-style: normal;
  font-size: 11px;
  font-weight: 800;
}

.viewer-peek,
.viewer-shot {
  position: absolute;
  background: var(--surface-primary);
  box-shadow: var(--ink-shadow);
  padding: 10px 10px 28px;
  border-radius: 22px;
  border: 0;
}

.viewer-peek {
  z-index: 2;
  width: 168px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: transform 180ms var(--ease-bounce), box-shadow 180ms ease;
}
.viewer-peek img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  border-radius: 14px;
  background: var(--surface-tertiary);
}
.viewer-peek figcaption,
.viewer-shot figcaption {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  text-align: center;
  font: 10px var(--font-mono);
  color: var(--ink-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.viewer-peek--prev { left: 28px; top: 248px; transform: rotate(-10deg); }
.viewer-peek--next { left: calc(46vw + 28px); top: 46%; transform: rotate(8deg); z-index: 4; }
.viewer-peek:hover { transform: rotate(0deg) translateY(-8px); z-index: 5; box-shadow: var(--surface-shadow-lg); }

.viewer-shot {
  z-index: 3;
  left: 96px;
  top: 92px;
  width: min(46vw, 660px);
  transform: rotate(-2.4deg);
}
.metadata-viewer__image-stage.is-fit { overflow: hidden; }
.metadata-viewer__image-stage.is-fit img.zoom-fit {
  display: block;
  width: 100%;
  height: min(68vh, 628px);
  object-fit: contain;
  border-radius: 16px;
  background: var(--surface-tertiary);
}
.metadata-viewer__image-stage.is-original {
  left: 24px;
  right: 440px;
  top: 80px;
  bottom: 58px;
  width: auto;
  overflow: auto;
  transform: none;
}
.metadata-viewer__image-stage.is-original img.zoom-original {
  display: block;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  margin: 12px auto;
  border-radius: 8px;
}

.viewer-sticker {
  position: absolute;
  z-index: 5;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-primary);
  box-shadow: var(--surface-shadow-lg);
  outline: 3px solid var(--surface-primary);
  font: 800 13px var(--font-sans);
  color: var(--ink-primary);
  cursor: pointer;
}
.viewer-sticker b { font-family: var(--font-mono); font-size: 14px; color: var(--brand-hover); }
.viewer-sticker--count { left: 148px; top: 78px; transform: rotate(-8deg); }
.viewer-sticker--size { left: min(42vw, 560px); top: 96px; transform: rotate(7deg); }
.viewer-sticker--size b { color: var(--accent-peach-strong); }
.viewer-sticker--zoom { left: 150px; bottom: 86px; transform: rotate(-5deg); }
.viewer-sticker--zoom b,
.viewer-sticker--zoom { color: var(--accent-lavender-strong); }

.viewer-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: min(68vh, 628px);
  color: var(--ink-tertiary);
  font-size: 13px;
  font-weight: 700;
}
.viewer-loading span {
  width: 12px;
  height: 12px;
  border: 2px solid var(--line-strong);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.metadata-viewer__panel {
  position: absolute;
  z-index: 4;
  right: 28px;
  top: 96px;
  width: 396px;
  height: min(690px, calc(100vh - 140px));
  display: flex;
  flex-direction: column;
  padding: 28px 22px 22px;
  border-radius: var(--radius-hero);
  background: var(--surface-primary);
  box-shadow: var(--surface-shadow-lg);
  transform: rotate(1.6deg);
}

.viewer-tabs {
  position: absolute;
  left: 18px;
  right: 18px;
  top: -18px;
  height: 40px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-primary);
  box-shadow: var(--surface-shadow);
  display: flex;
  gap: 4px;
}
.viewer-tabs button {
  flex: 1;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink-tertiary);
  cursor: pointer;
  font: 800 12px var(--font-sans);
}
.viewer-tabs button.active {
  background: var(--brand-soft);
  color: var(--brand-hover);
}

.viewer-panel-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
}
.viewer-panel-scroll:hover { scrollbar-width: thin; }
.viewer-panel-scroll::-webkit-scrollbar { width: 0; }
.viewer-panel-scroll:hover::-webkit-scrollbar { width: 6px; }

.viewer-section { padding-top: 8px; }
.eyebrow {
  margin: 0 0 8px;
  color: var(--brand-primary);
  font: 800 10.5px var(--font-mono);
  letter-spacing: 0.14em;
}
.section-title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.section-title h2,
.viewer-section > h2 {
  margin: 0 0 14px;
  font-size: 24px;
  font-weight: 900;
}
.section-title h2 { margin-bottom: 0; }
.section-title button,
.section-title span {
  border: 0;
  background: transparent;
  color: var(--ink-tertiary);
  font: 700 12px var(--font-sans);
}
.section-title button { cursor: pointer; }
.section-title button:hover { color: var(--brand-hover); }

.kv { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.kv > div,
.metadata-field {
  padding: 10px 12px;
  border-radius: 16px;
  background: var(--surface-secondary);
  transform: rotate(var(--r, 0deg));
}
.kv small,
.metadata-field small,
.metadata-field span {
  display: block;
  margin-bottom: 3px;
  color: var(--ink-tertiary);
  font-size: 10.5px;
  font-weight: 800;
}
.kv b,
.metadata-field b,
.metadata-field strong {
  color: var(--ink-primary);
  font: 700 12.5px var(--font-mono);
  overflow-wrap: anywhere;
}
.metadata-field--multiline b,
.metadata-field--multiline strong { white-space: pre-line; line-height: 1.6; }

.chips,
.editable-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 16px; }
.chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--brand-tint);
  color: var(--ink-primary);
  font: 700 12px var(--font-sans);
  transform: rotate(var(--r, 0deg));
  cursor: pointer;
}
.chip.lav { background: var(--accent-lavender-soft); color: var(--accent-lavender-strong); }
.chip.mint { background: var(--accent-mint-soft); color: var(--accent-mint-strong); }
.editable-tags span { margin-left: 4px; color: var(--ink-quaternary); }

.acts { display: flex; gap: 8px; margin-top: 22px; }
.acts .btn { flex: 1; justify-content: center; }

.prompt-block {
  margin-bottom: 12px;
  padding: 14px;
  border-radius: 18px;
  background: var(--surface-secondary);
  transform: rotate(-0.6deg);
}
.prompt-block + .prompt-block { transform: rotate(0.5deg); }
.prompt-block div { display: flex; justify-content: space-between; gap: 8px; }
.prompt-block strong { color: var(--ink-primary); font-size: 13px; font-weight: 800; }
.prompt-block button {
  border: 0;
  background: transparent;
  color: var(--brand-hover);
  cursor: pointer;
  font: 700 12px var(--font-sans);
}
.prompt-block p {
  margin: 10px 0 0;
  color: var(--ink-secondary);
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.tag-editor-input { display: flex; gap: 8px; }
.tag-editor-input .form-input { height: 38px; }
.save-tags { width: 100%; margin-top: 18px; background: var(--brand-gradient); }
.send-link {
  width: 100%;
  margin-top: 10px;
  border: 0;
  background: transparent;
  color: var(--ink-tertiary);
  cursor: pointer;
  font: 700 12px var(--font-sans);
}
.send-link:hover { color: var(--brand-hover); }

.raw-metadata {
  margin: 0;
  padding: 14px;
  overflow: auto;
  border-radius: 16px;
  background: var(--surface-secondary);
  color: var(--ink-secondary);
  font: 12px/1.65 var(--font-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.history-list {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--surface-secondary);
}
.history-title { margin-bottom: 8px; color: var(--ink-secondary); font-size: 12px; font-weight: 800; }
.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid var(--line-subtle);
  font-size: 12px;
}
.history-item span { color: var(--ink-tertiary); }
.history-item button {
  border: 0;
  background: transparent;
  color: var(--brand-hover);
  cursor: pointer;
  font: 800 12px var(--font-sans);
}

.viewer-empty {
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--ink-tertiary);
  text-align: center;
}
.viewer-empty strong { color: var(--ink-secondary); font-size: 14px; font-weight: 800; }
.viewer-empty span { max-width: 250px; font-size: 12px; line-height: 1.7; }

.metadata-viewer__footer {
  position: absolute;
  z-index: 6;
  left: 28px;
  bottom: 18px;
  max-width: min(620px, calc(100vw - 460px));
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  background: var(--chrome-bg);
  box-shadow: var(--surface-shadow);
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-tertiary);
  font-size: 11.5px;
  transform: rotate(-1deg);
}
.metadata-viewer__footer > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metadata-viewer__footer div { white-space: nowrap; }
.metadata-viewer__footer kbd {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--brand-tint);
  font: 700 10px var(--font-mono);
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1100px) {
  .viewer-peek { display: none; }
  .viewer-shot { left: 24px; width: min(52vw, 520px); }
  .metadata-viewer__panel { width: 340px; }
}

@media (max-width: 850px) {
  .viewer-shot,
  .metadata-viewer__panel { position: relative; transform: none; left: auto; right: auto; top: auto; width: auto; }
  .metadata-viewer { overflow: auto; }
  .metadata-viewer__header { position: sticky; }
  .viewer-sticker--count { left: 24px; }
  .viewer-sticker--size { left: auto; right: 24px; }
  .metadata-viewer__footer { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .viewer-peek,
  .viewer-shot,
  .metadata-viewer__panel,
  .viewer-sticker,
  .kv > div,
  .metadata-field,
  .chip,
  .prompt-block,
  .metadata-viewer__footer { transform: none; }
  .viewer-peek { transition: none; }
  .viewer-loading span { animation-duration: 1.8s; }
}
</style>

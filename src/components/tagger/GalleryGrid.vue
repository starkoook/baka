<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu.vue'
import { layoutGalleryGrid, nextObservedGridWidth, visibleGalleryItems, MASONRY_GAP } from '@/lib/gallery-masonry-window'

interface ImageCard {
  id: number
  path: string
  filename: string
  width: number
  height: number
  file_size: number
  file_modified_at: string
  favorite?: number
}

const props = defineProps<{
  images: ImageCard[]
  selectedIds: Set<number>
  imageTags: Map<number, { tag: string }[]>
  isLoading: boolean
  isScanning: boolean
  hasMore: boolean
  viewMode?: 'small' | 'large' | 'list'
}>()

const emit = defineEmits<{
  select: [image: ImageCard]
  toggle: [image: ImageCard]
  rangeSelect: [image: ImageCard]
  openMetadata: [image: ImageCard, index: number]
  sendToTagger: [image: ImageCard]
  reveal: [image: ImageCard]
  scrollEnd: []
  requestThumb: [imageId: number, el: HTMLImageElement]
  delete: [image: ImageCard]
  toggleFavorite: [image: ImageCard]
}>()

let resizeObserver: ResizeObserver | null = null
const scrollContainer = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
const gridWidth = ref(0)
const scrollTop = ref(0)
const viewportHeight = ref(800)
const thumbs = reactive<Record<number, string>>({})
const focusedId = ref<number | null>(null)

const minTile = computed(() => (props.viewMode === 'large' ? 250 : 176))
const columns = computed(() => Math.max(1, Math.floor((gridWidth.value + MASONRY_GAP) / (minTile.value + MASONRY_GAP))))
const columnWidth = computed(() => (gridWidth.value - MASONRY_GAP * (columns.value - 1)) / columns.value)
const layout = computed(() => {
  if (gridWidth.value <= 0) return { items: [], totalHeight: 0 }
  return layoutGalleryGrid(props.images, {
    columns: columns.value,
    columnWidth: columnWidth.value,
    viewMode: props.viewMode,
    gridWidth: gridWidth.value,
  })
})
const visibleItems = computed(() => (
  visibleGalleryItems(layout.value.items, scrollTop.value, viewportHeight.value, 720)
))

function syncViewport() {
  const el = scrollContainer.value
  if (!el) return
  scrollTop.value = el.scrollTop
  viewportHeight.value = el.clientHeight
}

let ticking = false
function onScroll() {
  const el = scrollContainer.value
  if (!el) return
  if (!ticking) {
    ticking = true
    requestAnimationFrame(() => {
      syncViewport()
      ticking = false
    })
  }
  if (props.hasMore && !props.isLoading && el.scrollHeight - el.scrollTop - el.clientHeight < 900) emit('scrollEnd')
}

function requestVisibleThumbs() {
  const root = gridRef.value
  if (!root) return
  for (const item of visibleItems.value) {
    if (thumbs[item.image.id]) continue
    const el = root.querySelector<HTMLImageElement>(`img[data-image-id="${item.image.id}"]`)
    if (el) emit('requestThumb', item.image.id, el)
  }
}

onMounted(() => {
  syncViewport()
  if ('ResizeObserver' in window && scrollContainer.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) {
        const nextWidth = nextObservedGridWidth(gridWidth.value, box.width)
        if (nextWidth !== gridWidth.value) gridWidth.value = nextWidth
      }
      syncViewport()
    })
    resizeObserver.observe(scrollContainer.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch(visibleItems, () => { void nextTick(requestVisibleThumbs) })

function onCardClick(image: ImageCard, event: MouseEvent) {
  if (event.shiftKey) emit('rangeSelect', image)
  else if (event.ctrlKey || event.metaKey) emit('toggle', image)
  else emit('select', image)
}

function onContextMenu(image: ImageCard, index: number, event: MouseEvent) {
  contextMenu.value = {
    x: Math.min(event.clientX, window.innerWidth - 190),
    y: Math.min(event.clientY, window.innerHeight - 110),
    items: [
      { label: '查看图片与元数据', action: () => emit('openMetadata', image, index) },
      { label: '送去标注', action: () => emit('sendToTagger', image) },
      { label: image.favorite ? '取消收藏' : '收藏', action: () => emit('toggleFavorite', image) },
      { label: '打开文件位置', action: () => emit('reveal', image) },
      { label: '移入回收站', danger: true, action: () => emit('delete', image) },
    ],
  }
}

function setThumbSrc(imageId: number, src: string) {
  thumbs[imageId] = src
}

function getScrollTop() {
  return scrollContainer.value?.scrollTop ?? 0
}

function restoreScroll(nextTop: number) {
  if (scrollContainer.value) scrollContainer.value.scrollTop = nextTop
  syncViewport()
}

let focusTimer: ReturnType<typeof setTimeout> | null = null

/** 从首页跳进来时：按布局坐标滚到这张图，再闪一圈粉色光环。 */
function focusImage(imageId: number): boolean {
  const item = layout.value.items.find((entry) => entry.image.id === imageId)
  const scroller = scrollContainer.value
  if (!item || !scroller) return false
  scroller.scrollTop = Math.max(0, item.top - Math.max(24, (viewportHeight.value - item.height) / 2))
  syncViewport()
  void nextTick(() => {
    const card = gridRef.value?.querySelector<HTMLElement>(`[data-card-id="${imageId}"]`)
    if (!card) return
    focusedId.value = imageId
    card.focus({ preventScroll: true })
    if (focusTimer) clearTimeout(focusTimer)
    focusTimer = setTimeout(() => { if (focusedId.value === imageId) focusedId.value = null }, 2000)
  })
  return true
}

defineExpose({ setThumbSrc, getScrollTop, restoreScroll, focusImage })
</script>

<template>
  <main ref="scrollContainer" class="gallery-grid-scroll" @scroll.passive="onScroll">
    <div v-if="isScanning" class="gallery-state">
      <div class="state-spinner"></div>
      <strong>正在整理图库</strong>
      <span>图片还在，请稍等一下。</span>
    </div>

    <div v-else-if="images.length === 0" class="gallery-state gallery-state--empty">
      <strong>这里还没有图片</strong>
      <span>点击右上角“导入”，选择图片或文件夹即可开始整理和标注。</span>
    </div>

    <div
      v-else
      ref="gridRef"
      class="gallery-grid"
      :class="`gallery-grid--${viewMode || 'small'}`"
      :style="{ height: `${layout.totalHeight}px` }"
    >
      <article
        v-for="item in visibleItems"
        :key="item.image.id"
        class="image-card"
        :class="{
          'image-card--selected': selectedIds.has(item.image.id),
          'image-card--focus': focusedId === item.image.id,
        }"
        :data-card-id="item.image.id"
        :style="{
          top: `${item.top}px`,
          left: `${item.left}px`,
          width: `${item.width}px`,
          height: `${item.height}px`,
        }"
        tabindex="0"
        :title="item.image.filename"
        @click="onCardClick(item.image, $event)"
        @dblclick.prevent="emit('openMetadata', item.image, item.index)"
        @contextmenu.prevent="onContextMenu(item.image, item.index, $event)"
        @keydown.enter="emit('openMetadata', item.image, item.index)"
      >
        <div class="image-card__preview">
          <img :data-image-id="item.image.id" :src="thumbs[item.image.id] || undefined" :alt="item.image.filename" draggable="false" />
          <button
            class="image-card__check"
            :class="{ 'image-card__check--active': selectedIds.has(item.image.id) }"
            :aria-label="selectedIds.has(item.image.id) ? '取消选择' : '加入选择'"
            @click.stop="emit('toggle', item.image)"
          >
            <svg v-if="selectedIds.has(item.image.id)" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.2 8.2 3 3 6.6-6.6" /></svg>
          </button>
          <span class="image-card__dimensions">{{ item.image.width }} × {{ item.image.height }}</span>
          <button
            class="image-card__heart"
            :class="{ 'image-card__heart--active': item.image.favorite }"
            type="button"
            :aria-label="item.image.favorite ? '取消收藏' : '收藏'"
            :aria-pressed="Boolean(item.image.favorite)"
            @click.stop="emit('toggleFavorite', item.image)"
            @dblclick.stop
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17s-6-3.6-6-8.2A3.5 3.5 0 0 1 10 6.4a3.5 3.5 0 0 1 6 2.4C16 13.4 10 17 10 17Z" /></svg>
          </button>
          <div class="image-card__foot">
            <template v-if="imageTags.get(item.image.id)?.length">
              <span v-for="tag in imageTags.get(item.image.id)!.slice(0, 2)" :key="tag.tag" class="image-card__tag">{{ tag.tag }}</span>
              <span v-if="imageTags.get(item.image.id)!.length > 2" class="image-card__tag image-card__tag--more">+{{ imageTags.get(item.image.id)!.length - 2 }}</span>
            </template>
            <span v-else class="image-card__tag image-card__tag--empty">未标注</span>
          </div>
        </div>
        <div class="image-card__caption">
          <span>{{ item.image.filename }}</span>
          <small>{{ imageTags.get(item.image.id)?.length ? `${imageTags.get(item.image.id)!.length} 个标签` : '未标注' }}</small>
        </div>
      </article>
    </div>

    <div class="gallery-loading" :style="{ visibility: isLoading && !isScanning ? 'visible' : 'hidden' }"><span></span>正在加载更多</div>
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
.gallery-grid-scroll { min-width: 0; min-height: 0; overflow: auto; padding: 6px 10px 110px 6px; scrollbar-gutter: stable; overflow-anchor: none; }
.gallery-grid { position: relative; display: block; }
.image-card { position: absolute; min-width: 0; overflow: hidden; border: 0; border-radius: 22px; background: var(--surface-primary); cursor: default; outline: none; contain: layout paint; }
.image-card:hover, .image-card:focus-visible { z-index: 2; box-shadow: var(--surface-shadow-lg); }
.image-card--selected { box-shadow: 0 0 0 4px var(--brand-primary), var(--surface-shadow); }
.image-card--focus { animation: card-focus 1.8s cubic-bezier(.2,.8,.2,1) both; z-index: 3; }
@keyframes card-focus {
  0% { box-shadow: 0 0 0 4px var(--brand-primary), 0 0 0 10px rgba(var(--brand-primary-rgb), .45), var(--surface-shadow-lg); }
  60% { box-shadow: 0 0 0 4px var(--brand-primary), 0 0 0 26px rgba(var(--brand-primary-rgb), 0), var(--surface-shadow-lg); }
  100% { box-shadow: 0 0 0 4px var(--brand-primary), 0 0 0 30px rgba(var(--brand-primary-rgb), 0), var(--surface-shadow); }
}
.image-card__preview { position: absolute; inset: 0; overflow: hidden; background: var(--surface-tertiary); }
.image-card__preview img { width: 100%; height: 100%; object-fit: cover; user-select: none; display: block; }
.image-card__check { position: absolute; top: 10px; left: 10px; width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border: 2px solid rgba(255,255,255,.9); border-radius: 50%; background: rgba(74,45,61,.28); color: white; opacity: 0; cursor: pointer; }
.image-card:hover .image-card__check, .image-card__check--active { opacity: 1; }
.image-card__check--active { border-color: #fff; background: var(--brand-primary); }
.image-card__check svg { width: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; }
.image-card__heart { position: absolute; right: 10px; bottom: 10px; z-index: 2; width: 30px; height: 30px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: rgba(255,255,255,.92); color: var(--ink-tertiary); opacity: 0; cursor: pointer; }
.image-card__heart svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
.image-card:hover .image-card__heart, .image-card__heart--active { opacity: 1; }
.image-card__heart:hover { color: var(--accent-rose); }
.image-card__heart--active { color: var(--accent-rose); }
.image-card__heart--active svg { fill: currentColor; }
.image-card__dimensions { position: absolute; top: 10px; right: 10px; padding: 3px 8px; border-radius: 999px; background: rgba(74,45,61,.6); color: rgba(255,255,255,.9); font: 9.5px/1.3 var(--font-mono); opacity: 0; }
.image-card:hover .image-card__dimensions { opacity: 1; }
.image-card__foot { position: absolute; left: 0; right: 44px; bottom: 0; display: flex; gap: 4px; padding: 26px 10px 10px; background: linear-gradient(180deg, transparent, rgba(74,45,61,.42)); opacity: 0; pointer-events: none; }
.image-card:hover .image-card__foot, .image-card--selected .image-card__foot { opacity: 1; }
.image-card__tag { max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,.92); color: var(--ink-secondary); font-size: 9.5px; font-weight: 700; }
.image-card__tag--more { background: var(--brand-primary); color: #fff; font-family: var(--font-mono); }
.image-card__tag--empty { background: rgba(255,255,255,.7); color: var(--ink-tertiary); }
.image-card__caption { display: none; }
.gallery-grid--list .image-card { display: grid; grid-template-columns: 64px 1fr; align-items: center; border-radius: 16px; }
.gallery-grid--list .image-card__preview { position: relative; width: 64px; height: 64px; }
.gallery-grid--list .image-card__foot, .gallery-grid--list .image-card__dimensions { display: none; }
.gallery-grid--list .image-card__heart { right: auto; left: 38px; bottom: 4px; width: 22px; height: 22px; }
.gallery-grid--list .image-card__heart svg { width: 12px; height: 12px; }
.gallery-grid--list .image-card__check { top: 19px; left: 19px; }
.gallery-grid--list .image-card__caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 14px; }
.image-card__caption span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-primary); font-size: 12px; font-weight: 700; }
.image-card__caption small { flex: none; color: var(--ink-tertiary); font-size: 10.5px; font-family: var(--font-mono); }
.gallery-state { height: 100%; min-height: 360px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; color: var(--ink-tertiary); }
.gallery-state::before { content: ""; width: 64px; height: 64px; margin-bottom: 8px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff 0 20%, var(--brand-soft) 21%); box-shadow: 30px 26px 0 -20px var(--accent-lavender-soft); }
.gallery-state strong { color: var(--ink-primary); font-size: 16px; font-weight: 900; }
.gallery-state span { max-width: 340px; font-size: 12px; line-height: 1.7; }
.state-spinner { width: 28px; height: 28px; border: 3px solid var(--brand-soft); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin .8s linear infinite; }
.gallery-loading { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 18px; color: var(--ink-tertiary); font-size: 11px; }
.gallery-loading span { width: 10px; height: 10px; border: 2px solid var(--brand-soft); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .image-card { transition: none; } .image-card--focus { animation: none; box-shadow: 0 0 0 4px var(--brand-primary), 0 0 0 10px rgba(var(--brand-primary-rgb), .35); } .state-spinner, .gallery-loading span { animation-duration: 1.8s; } }
</style>

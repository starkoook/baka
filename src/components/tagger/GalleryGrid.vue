<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu.vue'

interface ImageCard {
  id: number
  path: string
  filename: string
  width: number
  height: number
  file_size: number
  file_modified_at: string
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
}>()

let observer: IntersectionObserver | null = null
const scrollContainer = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
const contextMenu = ref<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const el = entry.target as HTMLImageElement
      const imageId = Number(el.dataset.imageId)
      if (!imageId || el.getAttribute('src')) continue
      observer?.unobserve(el)
      emit('requestThumb', imageId, el)
    }
  }, { root: scrollContainer.value, rootMargin: '320px' })
  requestAnimationFrame(observeCards)
})

onBeforeUnmount(() => observer?.disconnect())
watch(
  () => `${props.images.length}:${props.images.map((image) => image.id).join(',')}`,
  () => requestAnimationFrame(observeCards),
)

function observeCards() {
  gridRef.value?.querySelectorAll<HTMLImageElement>('img[data-image-id]:not([src])').forEach((el) => observer?.observe(el))
}

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
      { label: '打开文件位置', action: () => emit('reveal', image) },
      { label: '移入回收站', danger: true, action: () => emit('delete', image) },
    ],
  }
}

function onScroll() {
  const el = scrollContainer.value
  if (!el || el.scrollHeight - el.scrollTop - el.clientHeight >= 400) return
  emit('scrollEnd')
  requestAnimationFrame(observeCards)
}

function setThumbSrc(imageId: number, src: string) {
  const el = gridRef.value?.querySelector<HTMLImageElement>(`img[data-image-id="${imageId}"]`)
  if (el) el.src = src
}

function getScrollTop() {
  return scrollContainer.value?.scrollTop ?? 0
}

function restoreScroll(scrollTop: number) {
  if (scrollContainer.value) scrollContainer.value.scrollTop = scrollTop
}

defineExpose({ setThumbSrc, getScrollTop, restoreScroll })
</script>

<template>
  <main ref="scrollContainer" class="gallery-grid-scroll" @scroll="onScroll">
    <div v-if="isScanning" class="gallery-state">
      <div class="state-spinner"></div>
      <strong>正在整理图库</strong>
      <span>图片还在，请稍等一下。</span>
    </div>

    <div v-else-if="images.length === 0" class="gallery-state gallery-state--empty">
      <strong>这里还没有图片</strong>
      <span>点击右上角“导入”，选择图片或文件夹即可开始整理和标注。</span>
    </div>

    <div v-else ref="gridRef" class="gallery-grid" :class="`gallery-grid--${viewMode || 'small'}`">
      <article
        v-for="(image, index) in images"
        :key="image.id"
        class="image-card"
        :class="{ 'image-card--selected': selectedIds.has(image.id) }"
        tabindex="0"
        @click="onCardClick(image, $event)"
        @dblclick.prevent="emit('openMetadata', image, index)"
        @contextmenu.prevent="onContextMenu(image, index, $event)"
        @keydown.enter="emit('openMetadata', image, index)"
      >
        <div class="image-card__preview">
          <img :data-image-id="image.id" :alt="image.filename" draggable="false" />
          <button
            class="image-card__check"
            :class="{ 'image-card__check--active': selectedIds.has(image.id) }"
            :aria-label="selectedIds.has(image.id) ? '取消选择' : '加入选择'"
            @click.stop="emit('toggle', image)"
          >
            <svg v-if="selectedIds.has(image.id)" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.2 8.2 3 3 6.6-6.6" /></svg>
          </button>
          <span class="image-card__dimensions">{{ image.width }} × {{ image.height }}</span>
          <div v-if="imageTags.get(image.id)?.length" class="image-card__tags">
            <span v-for="tag in imageTags.get(image.id)!.slice(0, 2)" :key="tag.tag">{{ tag.tag }}</span>
            <span v-if="imageTags.get(image.id)!.length > 2">+{{ imageTags.get(image.id)!.length - 2 }}</span>
          </div>
        </div>
        <div class="image-card__caption">
          <span>{{ image.filename }}</span>
          <small>{{ imageTags.get(image.id)?.length ? `${imageTags.get(image.id)!.length} 个标签` : '未标注' }}</small>
        </div>
      </article>
    </div>

    <div v-if="isLoading && !isScanning" class="gallery-loading"><span></span>正在加载更多</div>
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
.gallery-grid-scroll { min-width: 0; min-height: 0; overflow: auto; padding: 6px 10px 110px 6px; scrollbar-gutter: stable; }
.gallery-grid { display: grid; align-content: start; gap: 14px; }
.gallery-grid--small { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); }
.gallery-grid--large { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.gallery-grid--list { grid-template-columns: 1fr; gap: 6px; }
.image-card { min-width: 0; overflow: hidden; border: 0; border-radius: 22px; background: var(--surface-primary); box-shadow: 0 8px 18px rgba(74, 45, 61, .08); cursor: default; outline: none; transition: transform .25s var(--ease-bounce), box-shadow .2s ease; }
.image-card:hover, .image-card:focus-visible { transform: translateY(-3px) scale(1.02); box-shadow: var(--surface-shadow-lg); z-index: 2; }
.image-card--selected { box-shadow: 0 0 0 4px var(--brand-primary), var(--surface-shadow); }
.image-card__preview { position: relative; aspect-ratio: 1; overflow: hidden; background: var(--surface-tertiary); }
.image-card__preview img { width: 100%; height: 100%; object-fit: cover; user-select: none; }
.image-card__check { position: absolute; top: 10px; left: 10px; width: 26px; height: 26px; display: grid; place-items: center; padding: 0; border: 2px solid rgba(255,255,255,.9); border-radius: 50%; background: rgba(74,45,61,.28); color: white; opacity: 0; cursor: pointer; backdrop-filter: blur(6px); transition: opacity .15s ease, transform .2s var(--ease-bounce); }
.image-card:hover .image-card__check, .image-card__check--active { opacity: 1; }
.image-card__check--active { border-color: #fff; background: var(--brand-primary); transform: scale(1.06); }
.image-card__check svg { width: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; }
.image-card__dimensions { position: absolute; top: 10px; right: 10px; padding: 3px 8px; border-radius: 999px; background: rgba(74,45,61,.6); color: rgba(255,255,255,.9); font: 9.5px/1.3 var(--font-mono); opacity: 0; backdrop-filter: blur(6px); }
.image-card:hover .image-card__dimensions { opacity: 1; }
.image-card__tags { position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; gap: 4px; overflow: hidden; }
.image-card__tags span { max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,.92); color: var(--ink-secondary); font-size: 9.5px; font-weight: 700; }
.image-card__caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 12px 10px; }
.image-card__caption span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-secondary); font-size: 11px; font-weight: 600; }
.image-card__caption small { flex: none; color: var(--ink-tertiary); font-size: 9.5px; font-family: var(--font-mono); }
.gallery-grid--list .image-card { display: grid; grid-template-columns: 64px 1fr; border-radius: 16px; }
.gallery-grid--list .image-card__preview { aspect-ratio: 1; }
.gallery-grid--list .image-card__tags, .gallery-grid--list .image-card__dimensions { display: none; }
.gallery-state { height: 100%; min-height: 360px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; color: var(--ink-tertiary); }
.gallery-state::before { content: ""; width: 64px; height: 64px; margin-bottom: 8px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff 0 20%, var(--brand-soft) 21%); box-shadow: 30px 26px 0 -20px var(--accent-lavender-soft); }
.gallery-state strong { color: var(--ink-primary); font-size: 16px; font-weight: 900; }
.gallery-state span { max-width: 340px; font-size: 12px; line-height: 1.7; }
.state-spinner { width: 28px; height: 28px; border: 3px solid var(--brand-soft); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin .8s linear infinite; }
.gallery-loading { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 18px; color: var(--ink-tertiary); font-size: 11px; }
.gallery-loading span { width: 10px; height: 10px; border: 2px solid var(--brand-soft); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .image-card { transition: none; } .image-card:hover, .image-card:focus-visible { transform: none; } .state-spinner, .gallery-loading span { animation-duration: 1.8s; } }
</style>

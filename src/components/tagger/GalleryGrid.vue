<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface ImageCard {
  id: number
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
  scrollEnd: []
  requestThumb: [imageId: number, el: HTMLImageElement]
}>()

let observer: IntersectionObserver | null = null
const scrollContainer = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)

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
watch(() => props.images.length, () => requestAnimationFrame(observeCards))

function observeCards() {
  gridRef.value?.querySelectorAll<HTMLImageElement>('img[data-image-id]:not([src])').forEach((el) => observer?.observe(el))
}

function onCardClick(image: ImageCard, event: MouseEvent) {
  if (event.shiftKey) emit('rangeSelect', image)
  else if (event.ctrlKey || event.metaKey) emit('toggle', image)
  else emit('select', image)
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
      <span>从左侧添加一个图片文件夹，就可以开始整理和标注。</span>
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
  </main>
</template>

<style scoped>
.gallery-grid-scroll { min-width: 0; min-height: 0; overflow: auto; padding: 4px 8px 104px; scrollbar-gutter: stable; }
.gallery-grid { display: grid; align-content: start; gap: 12px; }
.gallery-grid--small { grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); }
.gallery-grid--large { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.gallery-grid--list { grid-template-columns: 1fr; gap: 5px; }
.image-card { min-width: 0; overflow: hidden; border: 1px solid rgba(255,255,255,.075); border-radius: 12px; background: rgba(255,255,255,.025); cursor: default; transition: border-color .16s ease, background .16s ease, transform .16s ease; outline: none; }
.image-card:hover, .image-card:focus-visible { border-color: rgba(var(--accent-primary-rgb),.45); background: rgba(255,255,255,.045); transform: translateY(-1px); }
.image-card--selected { border-color: rgba(var(--accent-primary-rgb),.9); box-shadow: inset 0 0 0 1px rgba(var(--accent-primary-rgb),.5); }
.image-card__preview { position: relative; aspect-ratio: 1; overflow: hidden; background: #16151b; }
.image-card__preview img { width: 100%; height: 100%; object-fit: cover; user-select: none; }
.image-card__check { position: absolute; top: 8px; left: 8px; width: 24px; height: 24px; display: grid; place-items: center; padding: 0; border: 1px solid rgba(255,255,255,.45); border-radius: 7px; background: rgba(17,15,21,.72); color: white; opacity: 0; cursor: pointer; backdrop-filter: blur(8px); }
.image-card:hover .image-card__check, .image-card__check--active { opacity: 1; }
.image-card__check--active { border-color: var(--accent-primary); background: var(--accent-primary); }
.image-card__check svg { width: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; }
.image-card__dimensions { position: absolute; top: 9px; right: 9px; padding: 3px 6px; border-radius: 6px; background: rgba(17,15,21,.68); color: rgba(255,255,255,.72); font: 9px/1.2 ui-monospace, monospace; opacity: 0; }
.image-card:hover .image-card__dimensions { opacity: 1; }
.image-card__tags { position: absolute; left: 8px; right: 8px; bottom: 8px; display: flex; gap: 4px; overflow: hidden; }
.image-card__tags span { max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 7px; border-radius: 999px; background: rgba(17,15,21,.75); color: rgba(255,255,255,.82); font-size: 9px; backdrop-filter: blur(8px); }
.image-card__caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 10px; }
.image-card__caption span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 11px; }
.image-card__caption small { flex: none; color: var(--text-tertiary); font-size: 9px; }
.gallery-grid--list .image-card { display: grid; grid-template-columns: 64px 1fr; }
.gallery-grid--list .image-card__preview { aspect-ratio: 1; }
.gallery-grid--list .image-card__tags, .gallery-grid--list .image-card__dimensions { display: none; }
.gallery-state { height: 100%; min-height: 360px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; color: var(--text-tertiary); }
.gallery-state strong { color: var(--text-secondary); font-size: 16px; }
.gallery-state span { max-width: 340px; font-size: 12px; line-height: 1.7; }
.state-spinner { width: 28px; height: 28px; border: 2px solid rgba(255,255,255,.08); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin .8s linear infinite; }
.gallery-loading { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 18px; color: var(--text-tertiary); font-size: 11px; }
.gallery-loading span { width: 10px; height: 10px; border: 2px solid rgba(255,255,255,.1); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .image-card { transition: none; } .state-spinner, .gallery-loading span { animation-duration: 1.8s; } }
</style>

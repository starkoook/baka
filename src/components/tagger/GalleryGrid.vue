<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

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
  clickCard: [image: ImageCard, index: number, event: MouseEvent]
  dblClickCard: [image: ImageCard, index: number]
  checkCard: [image: ImageCard]
  scrollEnd: []
  requestThumb: [imageId: number, el: HTMLImageElement]
}>()

const thumbCache = new Map<number, string>()
let observer: IntersectionObserver | null = null
const scrollContainer = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)

onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement
        const imageId = Number(el.dataset.imageId)
        if (imageId && !el.getAttribute('src')) {
          observer?.unobserve(el)
          emit('requestThumb', imageId, el as HTMLImageElement)
        }
      }
    }
  }, { rootMargin: '300px' })
  requestAnimationFrame(() => observeCards())
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

watch(() => props.images.length, () => {
  requestAnimationFrame(() => observeCards())
})

function observeCards() {
  gridRef.value?.querySelectorAll('.card-thumb img[data-image-id]:not([src])').forEach((el) => {
    observer?.observe(el)
  })
}

function onScroll() {
  const el = scrollContainer.value
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
    emit('scrollEnd')
    requestAnimationFrame(() => observeCards())
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function setThumbSrc(imageId: number, src: string) {
  thumbCache.set(imageId, src)
  const el = gridRef.value?.querySelector(`img[data-image-id="${imageId}"]`) as HTMLImageElement | null
  if (el) el.src = src
}
defineExpose({ setThumbSrc })
</script>

<template>
  <main ref="scrollContainer" class="gg-main" @scroll="onScroll">
    <!-- Empty state -->
    <div v-if="!isScanning && images.length === 0" class="gg-empty">
      <div class="gg-empty-glow"></div>
      <div class="gg-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8">
          <rect x="2" y="2" width="20" height="20" rx="4"/>
          <circle cx="8.5" cy="8.5" r="2"/>
          <path d="M22 16l-6-6-4 4-4-4L2 16"/>
        </svg>
      </div>
      <h2>在左侧选择一个文件夹</h2>
      <p>加载本地图片 · 浏览元数据 · 一键标注</p>
    </div>

    <!-- Grid -->
    <div ref="gridRef" class="gg-grid" :class="'gg-' + (viewMode || 'small')">
      <div
        v-for="(img, idx) in images"
        :key="img.id"
        class="gg-card"
        :class="{ selected: selectedIds.has(img.id) }"
        @click="emit('checkCard', img)"
        @dblclick="emit('dblClickCard', img, idx)"
      >
        <div class="card-thumb">
          <img :data-image-id="img.id" alt="" />
          <!-- Tag badges -->
          <div v-if="imageTags.has(img.id) && imageTags.get(img.id)!.length > 0" class="card-tags">
            <span v-for="(t, i) in imageTags.get(img.id)!.slice(0, 3)" :key="i" class="card-tag-pill">{{ t.tag }}</span>
            <span v-if="imageTags.get(img.id)!.length > 3" class="card-tag-more">+{{ imageTags.get(img.id)!.length - 3 }}</span>
          </div>
          <button class="card-check" :class="{ checked: selectedIds.has(img.id) }" @click.stop="emit('checkCard', img)">{{ selectedIds.has(img.id) ? '✓' : '' }}</button>
          <div class="card-overlay">
            <span class="card-dims">{{ img.width }} × {{ img.height }}</span>
          </div>
        </div>
        <div class="card-name">{{ img.filename }}</div>
      </div>
    </div>

    <div v-if="isLoading" class="gg-loading">加载中...</div>
  </main>
</template>

<style scoped>
.gg-main { overflow-y: auto; }
.gg-grid { display: grid; gap: 10px; padding: 2px; align-content: start; }
.gg-small { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.gg-large { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.gg-large .card-name { font-size: 12px; padding: 8px 10px; }
.gg-list { display: flex; flex-direction: column; gap: 2px; }
.gg-list .gg-card { display: flex; flex-direction: row; align-items: center; height: 56px; border-radius: 8px; }
.gg-list .card-thumb { width: 56px; height: 56px; aspect-ratio: auto; flex-shrink: 0; }
.gg-list .card-name { flex: 1; text-align: left; padding: 0 12px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gg-list .card-check { top: 50%; transform: translateY(-50%); }
.gg-list .card-tags { display: none; }
.gg-list .card-overlay { display: none; }
.gg-empty {
  height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}
.gg-empty-glow {
  position: absolute; width: 300px; height: 300px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,105,180,0.06) 0%, transparent 70%);
  top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;
}
.gg-empty-icon { width: 80px; height: 80px; color: #ff69b4; opacity: 0.4; margin-bottom: 16px; animation: float 3s ease-in-out infinite; }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.gg-empty h2 { font-size: 20px; background: linear-gradient(135deg, #ff69b4, #ff85c2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 700; margin: 0 0 8px; }
.gg-empty p { font-size: 12px; color: #6b7280; margin: 0; }

.gg-card {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg); overflow: hidden; cursor: pointer;
  transition: all 0.2s ease;
}
.gg-card:hover { border-color: rgba(244,114,182,0.4); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(244,114,182,0.1); }
.gg-card.selected { border-color: #ff69b4; box-shadow: 0 0 0 2px rgba(244,114,182,0.2); }

.card-thumb { aspect-ratio: 1; overflow: hidden; background: rgba(0,0,0,0.2); position: relative; }
.card-thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
.gg-card:hover .card-thumb img { transform: scale(1.04); }
.card-tags { position: absolute; bottom: 4px; left: 4px; right: 4px; display: flex; flex-wrap: wrap; gap: 2px; pointer-events: none; z-index: 2; }
.card-tag-pill { font-size: 8px; padding: 1px 5px; background: rgba(0,0,0,0.55); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: rgba(255,255,255,0.8); white-space: nowrap; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
.card-tag-more { font-size: 8px; padding: 1px 5px; background: rgba(244,114,182,0.2); border-radius: 10px; color: rgba(255,255,255,0.7); }
.card-select-badge { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; background: #ff69b4; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: 700; z-index: 3; }
.card-check {
  position: absolute; top: 6px; left: 6px; width: 22px; height: 22px;
  border-radius: 6px; border: 2px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.4);
  color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 3; opacity: 0;
  transition: opacity 0.15s, border-color 0.15s, background 0.15s;
}
.gg-card:hover .card-check, .card-check.checked { opacity: 1; }
.card-check.checked { background: #ff69b4; border-color: #ff69b4; }
.card-check:hover { border-color: #ff69b4; }
.card-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 6px; background: linear-gradient(transparent, rgba(0,0,0,0.45)); opacity: 0; transition: opacity 0.2s; z-index: 1; }
.gg-card:hover .card-overlay { opacity: 1; }
.card-dims { font-size: 9px; color: rgba(255,255,255,0.7); font-family: monospace; }
.card-name { padding: 6px 8px; font-size: 10px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
.gg-loading { text-align: center; padding: 20px; color: var(--text-tertiary); font-size: 11px; }
</style>

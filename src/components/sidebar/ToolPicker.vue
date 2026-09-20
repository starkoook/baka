<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToolPosters } from '@/composables/useToolPosters'
import { TOOL_CATALOG, filterTools, findToolByRoute, type ToolEntry, type ToolKey } from '@/features/tools/tool-catalog'
import { useAppStore } from '@/stores/app'
import { useBooruGalleryStore } from '@/stores/booru-gallery'
import { usePipelineStore } from '@/stores/pipeline'
import { useTaggerStore } from '@/stores/tagger'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const taggerStore = useTaggerStore()
const pipelineStore = usePipelineStore()
const booruStore = useBooruGalleryStore()
const { posterOf } = useToolPosters()

const activeKey = ref<ToolKey>('gallery')
const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const cardsRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
let dragStartX = 0
let dragStartScroll = 0
let didDrag = false

const visibleTools = computed(() => filterTools(query.value))
const activeTool = computed<ToolEntry>(() => TOOL_CATALOG.find((tool) => tool.key === activeKey.value) ?? TOOL_CATALOG[0])
const activeIndex = computed(() => Math.max(0, TOOL_CATALOG.findIndex((tool) => tool.key === activeKey.value)))

// ── 真实数字（不再写死） ──
const galleryStats = ref<{ totalImages: number; totalRoots: number } | null>(null)
async function loadGalleryStats() {
  if (!window.galleryAPI?.getStats) return
  try {
    const res = await window.galleryAPI.getStats()
    if (res.success && res.data) galleryStats.value = { totalImages: res.data.totalImages, totalRoots: res.data.totalRoots }
  } catch { /* 图库还没初始化时保持空 */ }
}
const pendingAnnotations = computed(() => taggerStore.queue.filter((item) => item.status !== 'reviewed').length)

interface ToolMeta { value: string; label: string }
function metaFor(key: ToolKey): ToolMeta {
  switch (key) {
    case 'gallery':
      return galleryStats.value ? { value: galleryStats.value.totalImages.toLocaleString(), label: '张图片' } : { value: '—', label: '张图片' }
    case 'booruGallery':
      return booruStore.sites.length > 0 ? { value: String(booruStore.sites.length), label: '个图站' } : { value: '—', label: '图站' }
    case 'tagger':
      return pendingAnnotations.value > 0 ? { value: String(pendingAnnotations.value), label: '待处理' } : { value: '空', label: '队列' }
    case 'training':
      return pipelineStore.currentTask
        ? { value: `${Math.round(pipelineStore.currentTask.progress)}%`, label: '进行中' }
        : { value: '空闲', label: '训练' }
    case 'console':
      return { value: String(appStore.errorCount), label: '个错误' }
    default:
      return { value: '·', label: '' }
  }
}
const activeMeta = computed(() => {
  const chips: string[] = []
  const meta = metaFor(activeKey.value)
  if (meta.value !== '·') chips.push(`${meta.value} ${meta.label}`.trim())
  if (activeKey.value === 'gallery' && galleryStats.value) chips.push(`${galleryStats.value.totalRoots} 个来源`)
  if (activeKey.value === 'tagger') chips.push(`${taggerStore.queue.length} 张在队列`)
  return chips
})

// ── 海报双层淡入淡出：只保留两张图在 DOM 里 ──
const layers = ref<{ src: string; position: string }[]>([
  { src: posterOf.value('gallery'), position: activeTool.value.posterPosition },
  { src: '', position: 'center' },
])
const frontLayer = ref(0)
function showPoster(tool: ToolEntry) {
  const src = posterOf.value(tool.key)
  if (layers.value[frontLayer.value].src === src) return
  const back = 1 - frontLayer.value
  layers.value[back] = { src, position: tool.posterPosition }
  frontLayer.value = back
}
watch(activeTool, (tool) => showPoster(tool))
watch(() => posterOf.value(activeKey.value), () => {
  // 自定义海报读完后，直接替换当前层，不做动画
  layers.value[frontLayer.value] = { src: posterOf.value(activeKey.value), position: activeTool.value.posterPosition }
})

watch(() => appStore.toolPickerOpen, (open) => {
  if (!open) return
  query.value = ''
  const current = findToolByRoute(route.path)
  if (current) activeKey.value = current.key
  showPoster(activeTool.value)
  void loadGalleryStats()
})
watch(() => appStore.toolPickerFocusRequest, async () => {
  if (!appStore.toolPickerOpen) return
  await nextTick()
  searchInput.value?.focus()
})
watch(visibleTools, (tools) => {
  if (tools.length > 0 && !tools.some((tool) => tool.key === activeKey.value)) activeKey.value = tools[0].key
})

function enterTool(tool: ToolEntry) {
  if (didDrag) {
    didDrag = false
    return
  }
  appStore.closeToolPicker()
  void router.push(tool.route)
}

function stepActive(delta: number) {
  const tools = visibleTools.value
  if (tools.length === 0) return
  const index = tools.findIndex((tool) => tool.key === activeKey.value)
  const next = (index + delta + tools.length) % tools.length
  activeKey.value = tools[next].key
  scrollActiveIntoView()
}

function scrollActiveIntoView() {
  void nextTick(() => {
    const card = cardsRef.value?.querySelector<HTMLElement>('.tool-card.active')
    card?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') { event.preventDefault(); stepActive(1) }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); stepActive(-1) }
  else if (event.key === 'Enter') { event.preventDefault(); if (visibleTools.value.length > 0) enterTool(activeTool.value) }
  else if (event.key === 'Escape') {
    event.preventDefault()
    if (query.value) query.value = ''
    else appStore.closeToolPicker()
  }
}

function onCardsPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  dragging.value = true
  didDrag = false
  dragStartX = event.clientX
  dragStartScroll = cardsRef.value?.scrollLeft ?? 0
  window.addEventListener('pointermove', onCardsPointerMove)
  window.addEventListener('pointerup', onCardsPointerUp, { once: true })
  window.addEventListener('pointercancel', onCardsPointerCancel, { once: true })
}

function onCardsPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const delta = event.clientX - dragStartX
  if (Math.abs(delta) > 4) didDrag = true
  if (cardsRef.value) cardsRef.value.scrollLeft = dragStartScroll - delta
}

function onCardsPointerUp() {
  dragging.value = false
  window.removeEventListener('pointermove', onCardsPointerMove)
}

function onCardsPointerCancel() {
  dragging.value = false
  window.removeEventListener('pointermove', onCardsPointerMove)
}
</script>

<template>
  <Transition name="view">
    <section
      v-if="appStore.toolPickerOpen"
      class="tool-picker"
      role="dialog"
      aria-modal="true"
      aria-label="工具选择"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <!-- full-bleed poster layers (two only) -->
      <div class="tool-picker__bg" aria-hidden="true">
        <img
          v-for="(layer, index) in layers"
          :key="index"
          class="tool-picker__poster"
          :class="{ 'is-active': index === frontLayer && layer.src }"
          :src="layer.src || undefined"
          :style="{ objectPosition: layer.position }"
          alt=""
        />
      </div>
      <div class="tool-picker__shade" aria-hidden="true"></div>

      <header class="tool-picker__head">
        <button class="tool-picker__back" type="button" aria-label="返回" @click="appStore.closeToolPicker()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          返回
        </button>
        <label class="tool-picker__search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref="searchInput" v-model="query" type="text" placeholder="输入工具名快速跳转…" aria-label="搜索工具" />
          <kbd>Ctrl K</kbd>
        </label>
      </header>

      <div class="tool-picker__title">
        <small>Tool · {{ String(activeIndex + 1).padStart(2, '0') }} / {{ String(TOOL_CATALOG.length).padStart(2, '0') }}</small>
        <h2>{{ activeTool.label }}</h2>
        <p>{{ activeTool.desc }}</p>
        <div v-if="activeMeta.length" class="tool-picker__meta">
          <span v-for="chip in activeMeta" :key="chip">{{ chip }}</span>
        </div>
      </div>

      <div
        ref="cardsRef"
        class="tool-picker__cards"
        :class="{ dragging }"
        @pointerdown="onCardsPointerDown"
      >
        <p v-if="visibleTools.length === 0" class="tool-picker__empty">没有叫“{{ query }}”的工具，试试「图库」「标注」「训练」…</p>
        <button
          v-for="tool in visibleTools"
          :key="tool.key"
          class="tool-card"
          :class="[`tool-card--${tool.key}`, { active: activeKey === tool.key }]"
          type="button"
          :aria-label="`进入${tool.label}`"
          @mouseenter="activeKey = tool.key"
          @focus="activeKey = tool.key"
          @click="enterTool(tool)"
        >
          <img class="tool-card__art" :src="posterOf(tool.key)" :style="{ objectPosition: tool.posterPosition }" alt="" />
          <span class="tool-card__shade"></span>
          <span class="tool-card__body">
            <span>
              <strong>{{ tool.label }}</strong>
              <small>{{ tool.desc }}</small>
            </span>
            <span class="tool-card__meta">
              <b>{{ metaFor(tool.key).value }}</b>
              <i>{{ metaFor(tool.key).label }}</i>
            </span>
          </span>
        </button>
      </div>
      <p class="tool-picker__hint" aria-hidden="true">← → 切换 · 回车进入 · Esc 返回</p>
    </section>
  </Transition>
</template>

<style scoped>
.tool-picker {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1b1420;
  outline: none;
}

/* poster layers */
.tool-picker__bg { position: absolute; inset: 0; }
.tool-picker__poster {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  will-change: opacity;
  transition: opacity 0.45s ease;
}
.tool-picker__poster.is-active { opacity: 1; }
.tool-picker__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(38, 22, 40, 0.66) 0%, rgba(38, 22, 40, 0.18) 30%, transparent 55%, rgba(38, 22, 40, 0.34) 100%),
    linear-gradient(0deg, rgba(38, 22, 40, 0.94) 0%, rgba(38, 22, 40, 0.5) 26%, transparent 52%, rgba(38, 22, 40, 0.28) 100%);
}

/* head */
.tool-picker__head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 30px 0;
}
.tool-picker__back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 16px 0 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #4a2d3d;
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  transition: transform 160ms var(--ease-bounce), background-color 160ms ease;
}
.tool-picker__back:hover { background: #fff; transform: translateX(-2px); }
.tool-picker__back svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.tool-picker__search {
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(320px, 30vw);
  height: 38px;
  padding: 0 10px 0 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: rgba(255, 255, 255, 0.85);
  transition: border-color 160ms ease, background-color 160ms ease;
}
.tool-picker__search:focus-within { border-color: rgba(255, 126, 182, 0.9); background: rgba(255, 255, 255, 0.2); }
.tool-picker__search svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; flex: none; }
.tool-picker__search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #fff; font: inherit; font-size: 12.5px; }
.tool-picker__search input::placeholder { color: rgba(255, 255, 255, 0.6); }
.tool-picker__search kbd { font-family: var(--font-mono); font-size: 10px; padding: 2px 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.25); color: #fff; }

/* title block */
.tool-picker__title { position: relative; z-index: 2; margin: auto 0 0 46px; max-width: 560px; color: #fff; }
.tool-picker__title small { display: block; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.2em; color: #ffb1d2; text-transform: uppercase; font-weight: 700; }
.tool-picker__title h2 { margin-top: 10px; font-size: clamp(34px, 3.4vw, 46px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; text-shadow: 0 4px 30px rgba(0, 0, 0, 0.4); }
.tool-picker__title p { margin-top: 12px; font-size: 14px; color: rgba(255, 255, 255, 0.82); }
.tool-picker__meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.tool-picker__meta span { height: 28px; padding: 0 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.14); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.22); font-size: 12px; display: inline-flex; align-items: center; font-family: var(--font-mono); }

/* bottom cards */
.tool-picker__cards {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-start;
  gap: 18px;
  padding: 48px 30px 44px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  cursor: grab;
  scrollbar-width: none;
  user-select: none;
  touch-action: none;
}
.tool-picker__cards:active, .tool-picker__cards.dragging { cursor: grabbing; }
.tool-picker__cards.dragging { scroll-behavior: auto; }
.tool-picker__cards.dragging .tool-card { transition: none; }
.tool-picker__cards::-webkit-scrollbar { display: none; }
.tool-picker__empty { align-self: center; color: rgba(255, 255, 255, 0.75); font-size: 13px; padding: 20px 0; }
.tool-card {
  width: 212px;
  flex: 0 0 212px;
  height: 134px;
  padding: 0;
  border-radius: 18px;
  overflow: hidden;
  position: relative;
  border: 1.5px solid rgba(255, 255, 255, 0.18);
  background: rgba(27, 20, 32, 0.7);
  color: #fff;
  cursor: grab;
  user-select: none;
  will-change: transform;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
  transition: transform 0.28s cubic-bezier(0.22, 1.2, 0.36, 1), box-shadow 0.28s ease, border-color 0.28s ease;
  animation: card-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
.tool-card:active { cursor: grabbing; }
.tool-card:nth-child(2) { animation-delay: 0.06s; }
.tool-card:nth-child(3) { animation-delay: 0.12s; }
.tool-card:nth-child(4) { animation-delay: 0.18s; }
.tool-card:nth-child(5) { animation-delay: 0.24s; }
.tool-card:nth-child(6) { animation-delay: 0.3s; }
@keyframes card-up {
  from { opacity: 0; transform: translateY(56px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.tool-card:hover, .tool-card:focus-visible {
  transform: translateY(-16px) scale(1.12);
  border-color: #fff;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
  z-index: 3;
  outline: none;
}
.tool-card.active {
  border-color: #ff7eb6;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.36), 0 0 0 4px rgba(255, 126, 182, 0.28), 0 0 30px rgba(255, 126, 182, 0.3);
}
.tool-card__art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.tool-card__shade { position: absolute; left: 0; right: 0; bottom: 0; height: 64%; background: linear-gradient(180deg, transparent, rgba(27, 20, 32, 0.9)); }
.tool-card__body { position: absolute; left: 0; right: 0; bottom: 0; padding: 36px 14px 12px; display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; text-align: left; }
.tool-card__body strong { display: block; font-size: 16px; font-weight: 800; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.65); }
.tool-card__body > span:first-child { min-width: 0; }
.tool-card__body small { display: block; margin-top: 3px; font-size: 10px; color: rgba(255, 255, 255, 0.82); text-shadow: 0 1px 5px rgba(0, 0, 0, 0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tool-card__meta { text-align: right; flex: 0 0 auto; }
.tool-card__meta b { display: block; font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: #ffb1d2; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.45); }
.tool-card__meta i { display: block; margin-top: 2px; font-size: 8.5px; font-style: normal; font-family: var(--font-mono); color: rgba(255, 255, 255, 0.72); }
.tool-picker__hint { position: absolute; z-index: 2; right: 30px; bottom: 16px; font-family: var(--font-mono); font-size: 10.5px; color: rgba(255, 255, 255, 0.55); }

.view-enter-active { transition: opacity 0.28s ease; }
.view-enter-from { opacity: 0; }
.view-leave-active { transition: opacity 0.2s ease; }
.view-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .tool-card { animation: none; transition: none; }
  .tool-card:hover, .tool-card:focus-visible { transform: none; }
  .tool-picker__poster { transition: none; }
}
</style>

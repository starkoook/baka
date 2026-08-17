<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

interface ToolEntry {
  key: 'gallery' | 'booruGallery' | 'tagger' | 'training' | 'upscale' | 'workbench' | 'video' | 'imageTools'
  label: string
  desc: string
  route: string
  poster: string
  meta: string
  value: string
}

const TOOLS: ToolEntry[] = [
  { key: 'gallery', label: '图库', desc: '整理与筛选素材', route: '/gallery', poster: '/tools/gallery.jpg', meta: '张图片', value: '1,284' },
  { key: 'booruGallery', label: '在线画廊', desc: '多图站搜索素材', route: '/booru-gallery', poster: '/tools/upscale.jpg', meta: '图站', value: '∞' },
  { key: 'tagger', label: '标注', desc: '自动打标与校对', route: '/tagger', poster: '/tools/tagger.jpg', meta: '待处理', value: '36' },
  { key: 'training', label: '训练', desc: 'LoRA 模型训练', route: '/training', poster: '/tools/train.jpg', meta: '20 轮 · 进行中', value: 'E03' },
  { key: 'upscale', label: '放大', desc: '高清超分辨率', route: '/upscale', poster: '/tools/upscale.jpg', meta: '排队中', value: '12' },
  { key: 'workbench', label: '工作台', desc: '无限画布 · 自由整理', route: '/workbench', poster: '/tools/workbench.jpg', meta: '画布', value: '∞' },
  { key: 'video', label: '视频工具', desc: '视频抽帧与转换', route: '/video', poster: '/tools/upscale.jpg', meta: '抽帧', value: 'V' },
  { key: 'imageTools', label: '图像工具', desc: '背景、编辑与图库体检', route: '/image-tools', poster: '/tools/upscale.jpg', meta: '工具', value: 'I' },
]

const activeTool = ref<ToolEntry['key']>('gallery')
const posterData = ref<Record<string, string>>({})
const cardsRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
let dragStartX = 0
let dragStartScroll = 0
let didDrag = false

async function loadCustomPosters() {
  const next: Record<string, string> = {}
  for (const tool of TOOLS) {
    const path = appStore.toolPosters[tool.key]
    if (path && window.fsAPI) {
      const result = await window.fsAPI.readImageBase64(path)
      if (result.success) {
        next[tool.key] = `data:${result.mime};base64,${result.base64}`
        continue
      }
    }
    next[tool.key] = ''
  }
  posterData.value = next
}

watch(
  () => appStore.toolPickerOpen,
  (open) => {
    if (open) void loadCustomPosters()
  },
)

// 设置里更换/重置背景图后，工具选择页立即跟着刷新
watch(
  () => appStore.toolPosters,
  () => {
    if (appStore.toolPickerOpen) void loadCustomPosters()
  },
  { deep: true },
)

function enterTool(route: string) {
  if (didDrag) {
    didDrag = false
    return
  }
  appStore.closeToolPicker()
  router.push(route)
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
    >
      <!-- full-bleed poster layers -->
      <div class="tool-picker__bg">
        <img
          v-for="tool in TOOLS"
          :key="tool.key"
          class="tool-picker__poster"
          :class="[`tool-picker__poster--${tool.key}`, { active: activeTool === tool.key }]"
          :src="posterData[tool.key] || tool.poster"
          alt=""
        />
      </div>
      <div class="tool-picker__shade" aria-hidden="true"></div>

      <header class="tool-picker__head">
        <button class="tool-picker__back" type="button" aria-label="返回仪表盘" @click="appStore.closeToolPicker()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          返回
        </button>
      </header>

      <div
        ref="cardsRef"
        class="tool-picker__cards"
        :class="{ dragging }"
        @pointerdown="onCardsPointerDown"
      >
        <button
          v-for="tool in TOOLS"
          :key="tool.key"
          class="tool-card"
          :class="{ active: activeTool === tool.key }"
          type="button"
          :aria-label="`进入${tool.label}`"
          @mouseenter="activeTool = tool.key"
          @click="enterTool(tool.route)"
        >
          <img class="tool-card__art" :src="posterData[tool.key] || tool.poster" alt="" />
          <span class="tool-card__shade"></span>
          <span class="tool-card__body">
            <span>
              <strong>{{ tool.label }}</strong>
              <small>{{ tool.desc }}</small>
            </span>
            <span class="tool-card__meta">
              <b>{{ tool.value }}</b>
              <i>{{ tool.meta }}</i>
            </span>
          </span>
        </button>
      </div>
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
  background: var(--app-bg);
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
  visibility: hidden;
  will-change: opacity;
  transition: opacity 0.45s ease, visibility 0s linear 0.45s;
}
.tool-picker__poster.active {
  opacity: 1;
  visibility: visible;
  transition: opacity 0.45s ease;
}
.tool-picker__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--app-bg) 68%, transparent) 0%, color-mix(in srgb, var(--app-bg) 18%, transparent) 30%, transparent 55%, color-mix(in srgb, var(--app-bg) 34%, transparent) 100%),
    linear-gradient(0deg, color-mix(in srgb, var(--app-bg) 92%, transparent) 0%, color-mix(in srgb, var(--app-bg) 42%, transparent) 28%, transparent 52%, color-mix(in srgb, var(--app-bg) 40%, transparent) 100%);
}

/* head */
.tool-picker__head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 22px 30px 0;
}
.tool-picker__back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-primary) 72%, transparent);
  backdrop-filter: blur(10px);
  color: var(--text-primary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 620;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
}
.tool-picker__back:hover { background: var(--brand-soft); color: var(--brand-primary); transform: translateX(-2px); }
.tool-picker__back svg { width: 15px; height: 15px; }

/* bottom cards */
.tool-picker__cards {
  position: relative;
  z-index: 2;
  margin-top: auto;
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-start;
  gap: 18px;
  padding: 52px 30px 48px;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  cursor: grab;
  scrollbar-width: none;
  user-select: none;
  touch-action: none;
  -webkit-overflow-scrolling: touch;
}
.tool-picker__cards:active {
  cursor: grabbing;
}
.tool-picker__cards.dragging {
  cursor: grabbing;
  scroll-behavior: auto;
}
.tool-picker__cards.dragging .tool-card {
  transition: none;
}
.tool-picker__cards::-webkit-scrollbar {
  display: none;
}
.tool-card {
  width: 212px;
  flex: 0 0 212px;
  height: 134px;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: color-mix(in srgb, var(--surface-primary) 70%, transparent);
  cursor: grab;
  user-select: none;
  will-change: transform;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
  transition: transform 0.28s cubic-bezier(0.22, 1.2, 0.36, 1), box-shadow 0.28s ease, border-color 0.28s ease;
  animation: card-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
.tool-card:active {
  cursor: grabbing;
}
.tool-card:nth-child(2) { animation-delay: 0.08s; }
.tool-card:nth-child(3) { animation-delay: 0.16s; }
.tool-card:nth-child(4) { animation-delay: 0.24s; }
.tool-card:nth-child(5) { animation-delay: 0.32s; }
@keyframes card-up {
  from { opacity: 0; transform: translateY(56px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.tool-card:hover {
  transform: translateY(-16px) scale(1.12);
  border-color: color-mix(in srgb, var(--brand-primary) 85%, transparent);
  border-width: 2px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42), 0 0 30px color-mix(in srgb, var(--brand-primary) 16%, transparent);
  z-index: 3;
}
.tool-card.active {
  border-color: color-mix(in srgb, var(--brand-primary) 65%, transparent);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.36), 0 0 26px color-mix(in srgb, var(--brand-primary) 13%, transparent);
}
.tool-card__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tool-card__shade {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 60%;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--app-bg) 88%, transparent));
}
.tool-card__body {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 36px 14px 12px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
}
.tool-card__body strong {
  display: block;
  font-size: 16px;
  font-weight: 720;
  color: #ffffff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.65);
}
.tool-card__body small {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.6);
}
.tool-card__meta { text-align: right; flex: 0 0 auto; }
.tool-card__meta b {
  display: block;
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  color: var(--brand-primary);
  text-shadow: 0 1px 8px rgba(255, 255, 255, 0.45);
}
.tool-card__meta i {
  display: block;
  margin-top: 2px;
  font-size: 8.5px;
  font-style: normal;
  font-family: var(--font-mono);
  color: rgba(255, 255, 255, 0.72);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.view-enter-active {
  transition: opacity 0.28s ease;
}
.view-enter-from {
  opacity: 0;
}
.view-leave-active {
  transition: opacity 0.2s ease;
}
.view-leave-to {
  opacity: 0;
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TagQueueItem } from '@/stores/tagger'

const props = defineProps<{ queue: TagQueueItem[]; currentIndex: number; collapsed: boolean }>()
defineEmits<{ select: [index: number]; addFiles: []; addFolder: []; retry: []; removeSelected: []; toggleCollapsed: []; context: [index: number, event: MouseEvent] }>()

const statusLabel: Record<TagQueueItem['status'], string> = {
  pending: '等待', running: '识别中', ready: '待校对', reviewed: '已保存', failed: '失败', partial: '部分保存',
}

/** 缩略图按需加载：只有滚进视野的项目才向主进程要 media:// 地址（走图库同一套缓存） */
const listRef = ref<HTMLElement | null>(null)
const thumbs = ref<Record<string, string>>({})
const failedThumbs = new Set<string>()
let observer: IntersectionObserver | null = null

async function requestThumb(path: string) {
  if (thumbs.value[path] || failedThumbs.has(path) || !window.galleryAPI?.getThumbnailUrlByPath) return
  try {
    const res = await window.galleryAPI.getThumbnailUrlByPath(path)
    if (res.success && res.data?.url) thumbs.value = { ...thumbs.value, [path]: res.data.url }
    else failedThumbs.add(path)
  } catch {
    failedThumbs.add(path)
  }
}

function observeAll() {
  if (!observer) return
  listRef.value?.querySelectorAll<HTMLElement>('[data-thumb-path]').forEach((el) => observer!.observe(el))
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) return
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const path = (entry.target as HTMLElement).dataset.thumbPath
      if (path) void requestThumb(path)
      observer?.unobserve(entry.target)
    }
  }, { root: listRef.value, rootMargin: '200px' })
  observeAll()
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => props.queue.map((item) => item.path).join('|'), () => requestAnimationFrame(observeAll))
watch(() => props.collapsed, (collapsed) => { if (!collapsed) requestAnimationFrame(observeAll) })

function fileName(path: string) {
  return path.split(/[/\\]/).pop() ?? path
}
</script>

<template>
  <aside class="tag-queue" :class="{ 'tag-queue--collapsed': collapsed }">
    <header>
      <div v-if="!collapsed" class="queue-head-text">
        <h2>队列</h2>
        <span class="queue-count"><b>{{ queue.filter((item) => item.status === 'reviewed').length }}</b> / {{ queue.length }}</span>
      </div>
      <span v-else class="queue-count queue-count--pill">{{ queue.length }}</span>
      <button class="queue-collapse" type="button" :aria-label="collapsed ? '展开任务队列' : '收起任务队列'" @click="$emit('toggleCollapsed')">{{ collapsed ? '›' : '‹' }}</button>
    </header>

    <div v-if="!collapsed" ref="listRef" class="queue-list">
      <button
        v-for="(item, index) in queue"
        :key="`${item.path}-${index}`"
        type="button"
        class="queue-item"
        :class="[`queue-item--${item.status}`, { active: currentIndex === index }]"
        :data-thumb-path="item.path"
        :title="`${fileName(item.path)} · ${statusLabel[item.status]}`"
        @click="$emit('select', index)"
        @contextmenu.prevent="$emit('context', index, $event)"
      >
        <span class="queue-item__frame">
          <img v-if="thumbs[item.path]" :src="thumbs[item.path]" alt="" draggable="false" />
          <span v-else class="queue-item__placeholder" aria-hidden="true"></span>
          <i class="queue-item__badge" :class="`badge-${item.status}`" aria-hidden="true">
            <svg v-if="item.status === 'reviewed'" viewBox="0 0 16 16"><path d="m3.2 8.4 3 3 6.6-6.8" /></svg>
            <svg v-else-if="item.status === 'failed' || item.status === 'partial'" viewBox="0 0 16 16"><path d="M8 3.5v5.5M8 12.2v.3" /></svg>
            <svg v-else-if="item.status === 'ready'" viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </i>
        </span>
        <span class="queue-item__meta">
          <small class="queue-item__index">{{ String(index + 1).padStart(2, '0') }}</small>
          <small class="queue-item__name">{{ fileName(item.path) }}</small>
        </span>
      </button>
      <div v-if="queue.length === 0" class="queue-empty"><span>队列为空 · 可从图库发送或继续添加</span></div>
    </div>

    <div v-if="!collapsed && queue.some((item) => item.status === 'failed' || item.status === 'partial')" class="queue-retry"><button type="button" @click="$emit('retry')">重试失败项目</button></div>
    <footer v-if="!collapsed">
      <button type="button" class="queue-add" @click="$emit('addFiles')">＋ 图片</button>
      <button type="button" @click="$emit('addFolder')">文件夹</button>
      <button type="button" class="queue-remove" :disabled="queue.length === 0 || currentIndex < 0" @click="$emit('removeSelected')">删除选中</button>
    </footer>
    <button v-else class="queue-rail-add" type="button" aria-label="添加图片" @click="$emit('addFiles')">＋</button>
  </aside>
</template>

<style scoped>
.tag-queue { width: 184px; flex: 0 0 184px; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 0; border-radius: 28px; background: var(--surface-primary); box-shadow: var(--surface-shadow); transition: width .16s ease, flex-basis .16s ease; }
.tag-queue--collapsed { width: 48px; flex-basis: 48px; }
.tag-queue header { flex: none; display: flex; align-items: center; gap: 8px; padding: 14px 12px 6px 16px; }
.queue-head-text { min-width: 0; flex: 1; display: flex; align-items: baseline; gap: 8px; }
.tag-queue h2 { margin: 0; font-size: 14px; font-weight: 900; color: var(--ink-primary); }
.queue-count { color: var(--ink-tertiary); font: 11px var(--font-mono); }
.queue-count b { color: var(--brand-hover); font-weight: 800; }
.queue-count--pill { display: grid; place-items: center; min-width: 24px; height: 22px; padding: 0 6px; border-radius: 999px; background: var(--brand-soft); color: var(--brand-hover); font-weight: 800; }
.queue-collapse { width: 26px; height: 26px; flex: none; padding: 0; border: 0; border-radius: 50%; background: var(--surface-secondary); color: var(--ink-tertiary); cursor: pointer; font: inherit; font-size: 15px; line-height: 1; }
.queue-collapse:hover { background: var(--brand-soft); color: var(--brand-hover); }
.tag-queue--collapsed header { flex-direction: column; padding: 12px 0 6px; gap: 8px; }
.tag-queue--collapsed .queue-collapse { order: -1; }

.queue-list { flex: 1; min-height: 0; overflow: auto; padding: 4px 12px 8px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; }
.queue-item { width: 100%; display: grid; gap: 5px; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit; }
.queue-item__frame { position: relative; display: block; aspect-ratio: 1; width: 100%; min-height: 0; overflow: hidden; border-radius: 20px; background: var(--surface-primary); box-shadow: 0 6px 16px rgba(74,45,61,.1); transition: transform .25s var(--ease-bounce), box-shadow .2s ease; }
.queue-item__frame img, .queue-item__placeholder { position: absolute; inset: 4px; display: block; width: calc(100% - 8px); height: calc(100% - 8px); object-fit: cover; border-radius: 16px; background: var(--surface-tertiary); }
.queue-item__placeholder { background: linear-gradient(135deg, var(--surface-tertiary), var(--brand-tint)); }
.queue-item:hover .queue-item__frame { transform: translateY(-2px) scale(1.02); box-shadow: var(--surface-shadow); }
.queue-item.active .queue-item__frame { box-shadow: 0 0 0 3px var(--brand-primary), var(--surface-shadow-lg); transform: scale(1.04); }
.queue-item__badge { position: absolute; right: 6px; top: 6px; width: 22px; height: 22px; display: none; place-items: center; border-radius: 50%; background: var(--accent-mint); color: #fff; box-shadow: 0 0 0 3px var(--surface-primary); }
.queue-item__badge svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.queue-item__badge.badge-reviewed { display: grid; }
.queue-item__badge.badge-ready { display: grid; background: var(--accent-sky); }
.queue-item__badge.badge-failed, .queue-item__badge.badge-partial { display: grid; background: var(--accent-rose); }
.queue-item__badge.badge-running { display: grid; background: var(--accent-peach); }
.queue-item__badge.badge-running::after { content: ""; width: 8px; height: 8px; border-radius: 50%; border: 2px solid #fff; border-top-color: transparent; animation: spin .8s linear infinite; }
.queue-item__meta { display: flex; align-items: baseline; gap: 6px; min-width: 0; padding: 0 4px; }
.queue-item__index { flex: none; color: var(--ink-quaternary); font: 10px var(--font-mono); }
.queue-item__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-tertiary); font-size: 10.5px; font-weight: 600; }
.queue-item.active .queue-item__name { color: var(--ink-primary); }
.queue-item--pending .queue-item__frame img { opacity: .85; }
.queue-empty { flex: 1; display: flex; align-items: center; justify-content: center; padding: 0 10px; color: var(--ink-tertiary); text-align: center; }
.queue-empty span { font-size: 11px; line-height: 1.6; }
.queue-retry { padding: 4px 12px; }
.queue-retry button { width: 100%; height: 32px; border: 0; border-radius: 999px; background: var(--danger-bg); color: var(--danger-foreground); cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 700; }
.tag-queue footer { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 8px 12px 12px; }
.tag-queue footer button { height: 32px; border: 0; border-radius: 999px; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 700; transition: background-color 140ms ease, color 140ms ease; }
.tag-queue footer button:hover:not(:disabled) { background: var(--brand-soft); color: var(--brand-hover); }
.tag-queue footer button.queue-add { background: var(--brand-primary); color: var(--brand-on-primary); }
.tag-queue footer button.queue-add:hover { background: var(--brand-hover); color: #fff; }
.tag-queue footer button.queue-remove { grid-column: 1 / -1; background: transparent; color: var(--ink-tertiary); }
.tag-queue footer button.queue-remove:hover:not(:disabled) { background: var(--danger-bg); color: var(--danger-foreground); }
.tag-queue footer button.queue-remove:disabled { opacity: .35; cursor: not-allowed; }
.queue-rail-add { width: 32px; height: 32px; margin: auto auto 10px; border: 0; border-radius: 50%; background: var(--brand-primary); color: #fff; cursor: pointer; font-size: 18px; line-height: 1; box-shadow: 0 8px 18px rgba(var(--brand-primary-rgb), .3); }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1200px) {
  .tag-queue:not(.tag-queue--collapsed) { width: 150px; flex-basis: 150px; }
}
@media (max-width: 850px) {
  .tag-queue:not(.tag-queue--collapsed) { width: 128px; flex-basis: 128px; }
}
@media (prefers-reduced-motion: reduce) {
  .tag-queue, .queue-item__frame { transition: none; }
  .queue-item__badge.badge-running::after { animation: none; }
}
</style>

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
// 当前项变化时把它滚进视野
watch(() => props.currentIndex, () => {
  requestAnimationFrame(() => {
    listRef.value?.querySelector<HTMLElement>('.queue-item.active')?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  })
})

function fileName(path: string) {
  return path.split(/[/\\]/).pop() ?? path
}
</script>

<template>
  <!-- 参照设计稿：画布下方的横向图片工作区 -->
  <div class="tag-queue" :class="{ 'tag-queue--collapsed': collapsed }">
    <div v-if="!collapsed" ref="listRef" class="queue-list" role="listbox" aria-label="任务队列">
      <button
        v-for="(item, index) in queue"
        :key="`${item.path}-${index}`"
        type="button"
        role="option"
        class="queue-item"
        :class="[`queue-item--${item.status}`, { active: currentIndex === index }]"
        :aria-selected="currentIndex === index"
        :data-thumb-path="item.path"
        :title="`${fileName(item.path)} · ${statusLabel[item.status]}`"
        @click="$emit('select', index)"
        @contextmenu.prevent="$emit('context', index, $event)"
      >
        <img v-if="thumbs[item.path]" :src="thumbs[item.path]" alt="" draggable="false" />
        <span v-else class="queue-item__placeholder" aria-hidden="true"></span>
        <i class="queue-item__badge" :class="`badge-${item.status}`" aria-hidden="true">
          <svg v-if="item.status === 'reviewed'" viewBox="0 0 16 16"><path d="m3.2 8.4 3 3 6.6-6.8" /></svg>
          <svg v-else-if="item.status === 'failed' || item.status === 'partial'" viewBox="0 0 16 16"><path d="M8 3.5v5.5M8 12.2v.3" /></svg>
          <svg v-else-if="item.status === 'ready'" viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        </i>
        <small class="queue-item__index">{{ index + 1 }}</small>
      </button>
      <p v-if="queue.length === 0" class="queue-empty">队列为空 · 从图库发送，或用右侧“添加图片 / 导入文件夹”</p>
    </div>
    <p v-else class="queue-collapsed-note">队列已收起 · {{ queue.length }} 张</p>
  </div>
</template>

<style scoped>
.tag-queue { width: 100%; min-height: 0; }
.tag-queue--collapsed { width: 100%; flex-basis: auto; }
.queue-list { display: flex; gap: 8px; min-height: 82px; padding: 8px 2px 6px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #cad7be transparent; }
.queue-item { position: relative; flex: none; width: 64px; height: 64px; padding: 0; overflow: hidden; border: 1px solid #dfe5d7; border-radius: 6px; background: #eef2e7; cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
.queue-item img, .queue-item__placeholder { display: block; width: 100%; height: 100%; object-fit: cover; }
.queue-item__placeholder { background: linear-gradient(135deg, #e9eee2, #dfe7d6); }
.queue-item:hover { border-color: #bacbaa; }
.queue-item.active { border-color: #6c845b; box-shadow: 0 0 0 2px #6c845b33; }
.queue-item--pending img { opacity: .82; }
.queue-item__badge { position: absolute; right: 4px; top: 4px; width: 16px; height: 16px; display: none; place-items: center; border-radius: 50%; background: #6c845b; color: #fff; }
.queue-item__badge svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.queue-item__badge.badge-reviewed { display: grid; }
.queue-item__badge.badge-ready { display: grid; background: #5d7d99; }
.queue-item__badge.badge-failed, .queue-item__badge.badge-partial { display: grid; background: #a3474f; }
.queue-item__badge.badge-running { display: grid; background: #b0853e; }
.queue-item__badge.badge-running::after { content: ""; width: 7px; height: 7px; border-radius: 50%; border: 2px solid #fff; border-top-color: transparent; animation: spin .8s linear infinite; }
.queue-item__index { position: absolute; left: 4px; bottom: 3px; padding: 0 4px; border-radius: 3px; background: #f9fbf1dc; color: #5f7150; font: 9px/1.5 Arial, sans-serif; }
.queue-empty, .queue-collapsed-note { margin: 0; display: flex; align-items: center; min-height: 82px; padding: 0 6px; color: #849078; font-size: 12px; }
.queue-collapsed-note { min-height: 32px; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .queue-item { transition: none; }
  .queue-item__badge.badge-running::after { animation: none; }
}
</style>

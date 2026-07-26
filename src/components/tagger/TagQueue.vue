<script setup lang="ts">
import type { TagQueueItem } from '@/stores/tagger'

defineProps<{ queue: TagQueueItem[]; currentIndex: number; collapsed: boolean }>()
defineEmits<{ select: [index: number]; addFiles: []; addFolder: []; retry: []; toggleCollapsed: [] }>()

const statusLabel: Record<TagQueueItem['status'], string> = {
  pending: '等待', running: '识别中', ready: '待校对', reviewed: '已保存', failed: '失败', partial: '部分保存',
}
</script>

<template>
  <aside class="tag-queue" :class="{ 'tag-queue--collapsed': collapsed }">
    <header>
      <div v-if="!collapsed"><p>QUEUE</p><h2>任务队列</h2></div>
      <span>{{ queue.length }}</span>
      <button class="queue-collapse" :aria-label="collapsed ? '展开任务队列' : '收起任务队列'" @click="$emit('toggleCollapsed')">{{ collapsed ? '›' : '‹' }}</button>
    </header>
    <div v-if="!collapsed" class="queue-list">
      <button v-for="(item, index) in queue" :key="`${item.path}-${index}`" :class="{ active: currentIndex === index }" @click="$emit('select', index)">
        <span class="queue-number">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="queue-file"><strong>{{ item.path.split(/[/\\]/).pop() }}</strong><small :class="`status-${item.status}`">{{ statusLabel[item.status] }}</small></span>
        <i :class="`dot-${item.status}`"></i>
      </button>
      <div v-if="queue.length === 0" class="queue-empty"><strong>队列是空的</strong><span>从图库送来图片，或在这里继续添加。</span></div>
    </div>
    <div v-if="!collapsed && queue.some((item) => item.status === 'failed' || item.status === 'partial')" class="queue-retry"><button @click="$emit('retry')">重试失败项目</button></div>
    <footer v-if="!collapsed"><button @click="$emit('addFiles')">＋ 添加图片</button><button @click="$emit('addFolder')">添加文件夹</button></footer>
    <button v-else class="queue-rail-add" aria-label="添加图片" @click="$emit('addFiles')">＋</button>
  </aside>
</template>

<style scoped>
.tag-queue { width: 190px; flex: 0 0 190px; min-height: 0; display: flex; flex-direction: column; border-right: 1px solid rgba(255,255,255,.065); background: rgba(10,9,13,.14); transition: width .16s ease, flex-basis .16s ease; }.tag-queue--collapsed { width: 48px; flex-basis: 48px; }.tag-queue header { height: 44px; flex: none; display: flex; align-items: center; gap: 7px; padding: 0 9px; border-bottom: 1px solid rgba(255,255,255,.055); }.tag-queue header > div { min-width: 0; flex: 1; }.tag-queue header p { margin: 0 0 1px; color: var(--accent-primary); font-size: 6px; font-weight: 750; letter-spacing: .14em; }.tag-queue h2 { margin: 0; font-size: 11px; }.tag-queue header > span { display: grid; place-items: center; min-width: 22px; height: 20px; border-radius: 999px; background: rgba(var(--accent-primary-rgb),.1); color: var(--accent-primary); font-size: 8px; }.queue-collapse { width: 23px; height: 23px; flex: none; padding: 0; border: 1px solid rgba(255,255,255,.07); border-radius: 6px; background: rgba(255,255,255,.025); color: var(--text-tertiary); cursor: pointer; }.tag-queue--collapsed header { height: auto; flex-direction: column; padding: 9px 0; }.tag-queue--collapsed .queue-collapse { order: -1; }.queue-list { flex: 1; min-height: 0; overflow: auto; padding: 6px; }.queue-list > button { width: 100%; min-height: 46px; display: flex; align-items: center; gap: 7px; padding: 6px 7px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--text-tertiary); cursor: pointer; text-align: left; }.queue-list > button:hover { background: rgba(255,255,255,.035); }.queue-list > button.active { border-color: rgba(var(--accent-primary-rgb),.18); background: rgba(var(--accent-primary-rgb),.075); }.queue-number { color: var(--text-tertiary); font: 8px ui-monospace, monospace; }.queue-file { min-width: 0; flex: 1; display: grid; gap: 3px; }.queue-file strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 9px; font-weight: 550; }.queue-file small { font-size: 7px; }.status-reviewed { color: #79d7a0; }.status-ready, .status-running { color: #78c8ff; }.status-failed, .status-partial { color: #ff9a86; }.queue-list i { width: 6px; height: 6px; flex: none; border-radius: 50%; background: rgba(255,255,255,.15); }.queue-list i.dot-running { background: #78c8ff; box-shadow: 0 0 8px rgba(120,200,255,.5); }.queue-list i.dot-reviewed { background: #79d7a0; }.queue-list i.dot-failed, .queue-list i.dot-partial { background: #ff8975; }.queue-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: var(--text-tertiary); text-align: center; }.queue-empty strong { color: var(--text-secondary); font-size: 11px; }.queue-empty span { max-width: 145px; font-size: 8px; line-height: 1.6; }.queue-retry { padding: 6px; }.queue-retry button { width: 100%; height: 29px; border: 1px solid rgba(255,137,117,.18); border-radius: 7px; background: rgba(255,137,117,.07); color: #ff9a86; cursor: pointer; font-size: 8px; }.tag-queue footer { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 7px; border-top: 1px solid rgba(255,255,255,.055); }.tag-queue footer button { height: 30px; border: 1px solid rgba(255,255,255,.07); border-radius: 7px; background: rgba(255,255,255,.025); color: var(--text-tertiary); cursor: pointer; font-size: 8px; }.tag-queue footer button:first-child { color: var(--accent-primary); }.queue-rail-add { width: 30px; height: 30px; margin: auto auto 9px; border: 1px solid rgba(var(--accent-primary-rgb),.2); border-radius: 7px; background: rgba(var(--accent-primary-rgb),.08); color: var(--accent-primary); cursor: pointer; }
@media (max-width: 850px) { .tag-queue:not(.tag-queue--collapsed) { width: 172px; flex-basis: 172px; } }
@media (prefers-reduced-motion: reduce) { .tag-queue { transition: none; } }
</style>

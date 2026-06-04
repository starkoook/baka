<script setup lang="ts">
import { useLogStore } from '@/stores/logs'
import { ref, watch, nextTick } from 'vue'

const logStore = useLogStore()
const listEl = ref<HTMLElement | null>(null)

watch(() => logStore.logs.length, async () => {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
})

function typeIcon(t: string): string {
  return t === 'error' ? '❌' : t === 'warn' ? '⚠️' : t === 'success' ? '✅' : '📋'
}
</script>

<template>
  <div class="console-page">
    <div class="page-header">
      <h1 class="page-title">控制台</h1>
      <p class="page-desc">系统日志与错误信息</p>
    </div>

    <div class="console-panel glass-panel">
      <div class="console-toolbar">
        <span class="log-count">{{ logStore.logs.length }} 条日志</span>
        <button class="clear-btn" @click="logStore.clear()" v-if="logStore.logs.length">清空</button>
      </div>

      <div class="log-list" ref="listEl" v-if="logStore.logs.length > 0">
        <div
          v-for="log in logStore.logs"
          :key="log.id"
          class="log-entry"
          :class="log.type"
        >
          <span class="log-icon">{{ typeIcon(log.type) }}</span>
          <span class="log-time">{{ log.time }}</span>
          <span class="log-msg">{{ log.message }}</span>
        </div>
      </div>

      <div class="empty-state" v-else>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" width="40" height="40">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <p>暂无日志</p>
        <p style="font-size:11px;margin-top:4px;">API 调用和错误信息会显示在这里</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.console-page { max-width: 800px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.page-desc { font-size: 13px; color: var(--text-tertiary); }

.console-panel { padding: 0; overflow: hidden; min-height: 300px; display: flex; flex-direction: column; }

.console-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--border-subtle);
}
.log-count { font-size: 11px; color: var(--text-tertiary); font-weight: 500; }
.clear-btn {
  padding: 4px 12px; border: 1px solid var(--glass-border); border-radius: var(--radius-full);
  background: var(--glass-bg); color: var(--text-tertiary); font-size: 11px;
  cursor: pointer; font-family: var(--font-sans); transition: all 0.2s;
}
.clear-btn:hover { background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.2); color: #f87171; }

.log-list {
  flex: 1; overflow-y: auto; padding: 8px;
  max-height: 500px;
  font-family: var(--font-mono); font-size: 12px;
}
.log-entry {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 10px; border-radius: var(--radius-xs);
  line-height: 1.6;
}
.log-entry:hover { background: var(--glass-bg); }
.log-entry.error { background: rgba(239,68,68,0.06); }
.log-entry.warn { background: rgba(245,158,11,0.05); }
.log-icon { flex-shrink: 0; font-size: 11px; }
.log-time { flex-shrink: 0; color: var(--text-tertiary); font-size: 11px; width: 65px; }
.log-msg { color: var(--text-secondary); word-break: break-all; }
.log-entry.error .log-msg { color: #f87171; }
.log-entry.warn .log-msg { color: #fbbf24; }
.log-entry.success .log-msg { color: #34d399; }
</style>

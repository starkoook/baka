<script setup lang="ts">
import { useLogStore } from '@/stores/logs'; import { ref, watch, nextTick, onMounted } from 'vue'
const logStore = useLogStore(); const filter = ref<'all'|'error'|'warn'|'info'>('all'); const logList = ref<HTMLElement | null>(null)
const filtered = ref<any[]>([])
function applyFilter() { if (filter.value === 'all') filtered.value = [...logStore.logs]; else filtered.value = logStore.logs.filter(e => e.type === filter.value) }
watch(() => logStore.logs.length, () => applyFilter()); watch(filter, () => applyFilter())
async function scrollBottom() { await nextTick(); if (logList.value) logList.value.scrollTop = logList.value.scrollHeight }
watch(() => filtered.value.length, () => scrollBottom())
onMounted(() => { applyFilter(); if (window.logAPI) window.logAPI.onEntry(() => applyFilter()); if (window.trainingAPI) window.trainingAPI.onLog(() => applyFilter()) })
function copyLogs() { navigator.clipboard.writeText(filtered.value.map(e => `[${e.time}] ${e.type.toUpperCase()}: ${e.message}`).join('\n')) }
const types = ['all','error','warn','info'] as const; const labels: Record<string,string> = { all:'全部', error:'错误', warn:'警告', info:'信息' }
const sym: Record<string,string> = { error:'✕', warn:'⚠', info:'○', success:'✓' }
</script>

<template>
  <div class="cl-root">
    <div class="cl-top">
      <div class="cl-dot-row"><span class="cl-dot red"></span><span class="cl-dot yellow"></span><span class="cl-dot green"></span><span class="cl-title">baka-tools — console</span></div>
      <div class="cl-bar">
        <span class="cl-count">{{ filtered.length }} 条</span>
        <div class="cl-filters">
          <button v-for="t in types" :key="t" :class="{ on: filter === t }" @click="filter = t">{{ labels[t] }}</button>
        </div>
        <button class="cl-act" @click="copyLogs">📋 复制</button>
        <button class="cl-act" @click="logStore.clear(); applyFilter()">清空</button>
      </div>
    </div>
    <div ref="logList" class="cl-body" v-if="filtered.length > 0">
      <div v-for="(e, i) in filtered" :key="i" class="cl-line" :class="e.type">
        <span class="cl-sym">{{ sym[e.type] || '○' }}</span>
        <span class="cl-time">{{ e.time }}</span>
        <span class="cl-msg">{{ e.message }}</span>
      </div>
    </div>
    <div v-else class="cl-empty">
      <span>_</span>
      <p>暂无日志</p>
    </div>
  </div>
</template>

<style scoped>
.cl-root { max-width: 900px; margin: 0 auto; background: #0d0d0e; border: 1px solid rgba(255,255,255,0.03); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; height: calc(100vh - 160px); }
.cl-top { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.03); }
.cl-dot-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.cl-dot { width: 10px; height: 10px; border-radius: 50%; }
.cl-dot.red { background: #ef4444; } .cl-dot.yellow { background: #f59e0b; } .cl-dot.green { background: #22c55e; }
.cl-title { font-size: 11px; color: #4b5563; font-family: monospace; }
.cl-bar { display: flex; align-items: center; gap: 8px; }
.cl-count { font-size: 10px; color: #4b5563; font-family: monospace; margin-right: 4px; }
.cl-filters { display: flex; gap: 2px; }
.cl-filters button { padding: 3px 10px; border: none; background: none; color: #4b5563; font-size: 10px; border-radius: 3px; cursor: pointer; font-family: monospace; }
.cl-filters button.on { background: rgba(255,255,255,0.06); color: #d1d5db; }
.cl-act { padding: 3px 10px; border: none; background: none; color: #4b5563; font-size: 10px; cursor: pointer; font-family: monospace; }
.cl-act:hover { color: #d1d5db; }

.cl-body { flex: 1; overflow-y: auto; padding: 6px 0; font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace; font-size: 11px; }
.cl-line { display: flex; gap: 8px; padding: 3px 14px; line-height: 1.5; border-bottom: 1px solid rgba(255,255,255,0.01); }
.cl-line.error { background: rgba(239,68,68,0.04); }
.cl-line.warn { background: rgba(245,158,11,0.03); }
.cl-sym { flex-shrink: 0; width: 12px; text-align: center; font-size: 9px; }
.cl-line.error .cl-sym { color: #ef4444; } .cl-line.warn .cl-sym { color: #f59e0b; } .cl-line.info .cl-sym { color: #6b7280; }
.cl-time { flex-shrink: 0; color: #374151; width: 55px; }
.cl-msg { color: #9ca3af; word-break: break-all; }
.cl-line.error .cl-msg { color: #fca5a5; } .cl-line.warn .cl-msg { color: #fcd34d; }

.cl-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #374151; font-family: monospace; }
.cl-empty span { font-size: 32px; animation: blink 1s infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
.cl-empty p { font-size: 12px; }
</style>

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
    <!-- ═══ CONTROL HEADER ═══ -->
    <div class="cabin-panel cl-hero">
      <span class="cabin-label">/// CONSOLE</span>
      <div class="cabin-panel-br"></div>

      <div class="cl-dot-row">
        <span class="cl-dot red"></span>
        <span class="cl-dot yellow"></span>
        <span class="cl-dot green"></span>
        <span class="cl-title">baka-tools — console</span>
        <span class="cl-count">{{ filtered.length }} 条</span>
      </div>

      <div class="cl-bar">
        <div class="cl-filters">
          <button
            v-for="t in types" :key="t"
            class="cl-chip"
            :class="{ on: filter === t }"
            @click="filter = t"
          >{{ labels[t] }}</button>
        </div>
        <div class="cl-spacer"></div>
        <button class="btn-secondary cl-act" @click="copyLogs">📋 复制</button>
        <button class="btn-secondary cl-act" @click="logStore.clear(); applyFilter()">🗑 清空</button>
      </div>
    </div>

    <!-- ═══ LOG BODY ═══ -->
    <div ref="logList" class="cl-body-hud" v-if="filtered.length > 0">
      <div v-for="(e, i) in filtered" :key="i" class="cl-line" :class="e.type">
        <span class="cl-sym">{{ sym[e.type] || '○' }}</span>
        <span class="cl-time">{{ e.time }}</span>
        <span class="cl-msg">{{ e.message }}</span>
      </div>
    </div>

    <!-- ═══ EMPTY STATE ═══ -->
    <div v-else class="cl-empty-hud">
      <div class="cl-empty-glow"></div>
      <span class="cl-empty-blink">_</span>
      <p>暂无日志 · 系统运行正常</p>
    </div>
  </div>
</template>

<style scoped>
.cl-root {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: calc(100vh - 160px);
}

/* ═══ HEADER ═══ */
.cl-hero { padding: 14px 18px; flex-shrink: 0; }

.cl-dot-row {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
}
.cl-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cl-dot.red   { background: #ef4444; }
.cl-dot.yellow { background: #f59e0b; }
.cl-dot.green  { background: #22c55e; }

.cl-title {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}
.cl-count {
  font-size: 10px;
  color: var(--hud-text-dim);
  font-family: var(--font-mono);
  margin-left: auto;
}

.cl-bar { display: flex; align-items: center; gap: 6px; }
.cl-filters { display: flex; gap: 3px; }
.cl-spacer { flex: 1; }

/* ── Filter chips ── */
.cl-chip {
  padding: 4px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.cl-chip:hover {
  background: var(--glass-bg);
  color: var(--text-secondary);
}
.cl-chip.on {
  background: var(--accent-bg);
  border-color: var(--border-accent);
  color: var(--accent-primary);
}

/* ── Action buttons (compact btn-secondary) ── */
.cl-act {
  padding: 5px 14px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}
.cl-act:hover {
  background: var(--glass-bg-hover);
  border-color: var(--border-accent);
  color: var(--text-primary);
}

/* ═══ LOG BODY (HUD terminal) ═══ */
.cl-body-hud {
  flex: 1;
  overflow-y: auto;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-md);
  padding: 8px 0;
  font-family: var(--font-mono);
  font-size: 11px;
  box-shadow: var(--hud-inset-shadow);
  position: relative;
}

/* Subtle scan line */
.cl-body-hud::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(255,255,255,0.006) 2px,
    rgba(255,255,255,0.006) 4px
  );
  pointer-events: none;
  z-index: 0;
}

.cl-line {
  display: flex;
  gap: 8px;
  padding: 4px 16px;
  line-height: 1.6;
  border-bottom: 1px solid rgba(255,255,255,0.012);
  animation: cl-fade-in 0.25s ease;
  position: relative;
  z-index: 1;
}
.cl-line:last-child { border-bottom: none; }
.cl-line.error { background: rgba(239,68,68,0.04); }
.cl-line.warn  { background: rgba(245,158,11,0.03); }

.cl-sym { flex-shrink: 0; width: 14px; text-align: center; font-size: 9px; }
.cl-line.error .cl-sym { color: #ef4444; }
.cl-line.warn  .cl-sym { color: #f59e0b; }
.cl-line.info  .cl-sym { color: var(--text-tertiary); }
.cl-line.success .cl-sym { color: var(--accent-success); }

.cl-time {
  flex-shrink: 0;
  color: var(--text-tertiary);
  width: 62px;
  opacity: 0.7;
}
.cl-msg {
  color: var(--text-secondary);
  word-break: break-all;
}
.cl-line.error .cl-msg { color: #fca5a5; }
.cl-line.warn  .cl-msg { color: #fcd34d; }

/* ═══ EMPTY STATE ═══ */
.cl-empty-hud {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-md);
  box-shadow: var(--hud-inset-shadow);
  position: relative;
  overflow: hidden;
}
.cl-empty-glow {
  position: absolute;
  width: 120px; height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(244,114,182,0.08) 0%, transparent 70%);
  pointer-events: none;
}
.cl-empty-blink {
  font-size: 36px;
  color: var(--accent-primary);
  animation: cl-blink 1s step-end infinite;
  position: relative;
}
.cl-empty-hud p {
  font-size: 12px;
  color: var(--text-tertiary);
  opacity: 0.6;
}

@keyframes cl-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes cl-fade-in {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

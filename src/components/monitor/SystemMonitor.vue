<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface SysStats {
  cpu: { usage: number; cores: number; model: string }
  memory: { used: number; total: number; percent: number }
  gpu: { name: string; vramUsed: number; vramTotal: number; vramPercent: number; temp: number; usage: number } | null
  uptime: number
  platform: string
}

const stats = ref<SysStats | null>(null)
const syncRate = ref(64)
let timer: ReturnType<typeof setInterval> | null = null
let syncTimer: ReturnType<typeof setInterval> | null = null

function updateSyncRate() {
  if (!stats.value) return
  const gpuUsage = stats.value.gpu?.usage || 0
  if (gpuUsage > 85) {
    syncRate.value = Math.min(120, syncRate.value + 8 + Math.random() * 6)
  } else {
    syncRate.value = 60 + Math.random() * 8
  }
}

async function refresh() {
  if (!window.systemAPI) return
  try { stats.value = await window.systemAPI.getStats() } catch (_) {}
}

onMounted(() => { refresh(); timer = setInterval(refresh, 2000); syncTimer = setInterval(updateSyncRate, 800) })
onUnmounted(() => { if (timer) clearInterval(timer); if (syncTimer) clearInterval(syncTimer) })

function barColor(percent: number): string {
  if (percent > 85) return 'var(--accent-danger)'
  if (percent > 60) return 'var(--accent-warning)'
  return 'var(--accent-success)'
}
function barClass(percent: number): string {
  return percent > 85 ? 'pulse-bar' : ''
}

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
</script>

<template>
  <div class="sys-monitor" v-if="stats">
    <!-- CPU -->
    <div class="monitor-row">
      <div class="monitor-label">
        <span class="monitor-icon">🧠</span>
        <span class="monitor-name">CPU</span>
        <span class="monitor-sub">{{ stats.cpu.cores }} 核 · {{ stats.cpu.usage }}%</span>
      </div>
      <div class="monitor-bar">
        <div class="monitor-fill progress-flow" :class="barClass(stats.cpu.usage)" :style="{ width: stats.cpu.usage + '%', background: barColor(stats.cpu.usage) }"></div>
      </div>
    </div>

    <!-- Memory -->
    <div class="monitor-row">
      <div class="monitor-label">
        <span class="monitor-icon">💾</span>
        <span class="monitor-name">RAM</span>
        <span class="monitor-sub">{{ stats.memory.used }} / {{ stats.memory.total }} MB</span>
      </div>
      <div class="monitor-bar">
        <div class="monitor-fill progress-flow" :class="barClass(stats.memory.percent)" :style="{ width: stats.memory.percent + '%', background: barColor(stats.memory.percent) }"></div>
      </div>
    </div>

    <!-- GPU -->
    <div class="monitor-row" v-if="stats.gpu">
      <div class="monitor-label">
        <span class="monitor-icon">🎮</span>
        <span class="monitor-name">GPU</span>
        <span class="monitor-sub" v-if="stats.gpu.vramTotal > 0">{{ stats.gpu.vramUsed }} / {{ stats.gpu.vramTotal }} MB</span>
        <span class="monitor-sub" v-else>{{ stats.gpu.name?.slice(0, 20) || 'GPU' }}</span>
      </div>
      <div class="monitor-bar" v-if="stats.gpu.vramTotal > 0">
        <div class="monitor-fill progress-flow" :class="barClass(stats.gpu.vramPercent)" :style="{ width: stats.gpu.vramPercent + '%', background: barColor(stats.gpu.vramPercent) }"></div>
      </div>
      <div class="gpu-extras" v-if="stats.gpu.temp > 0 || stats.gpu.usage > 0">
        <span v-if="stats.gpu.temp > 0">🌡 {{ stats.gpu.temp }}°C</span>
        <span v-if="stats.gpu.usage > 0">📊 {{ stats.gpu.usage }}%</span>
      </div>
    </div>

    <!-- Uptime -->
    <div class="monitor-row uptime-row">
      <span class="monitor-icon">⏱</span>
      <span class="monitor-sub">运行时间 {{ formatUptime(stats.uptime) }}</span>
    </div>

    <!-- ═══ SYNC RATE HUD ═══ -->
    <div class="sync-rate-section" v-if="stats">
      <div class="sync-header">
        <span class="sync-icon">⚡</span>
        <span class="sync-label">SYNC RATE</span>
        <span class="sync-value" :class="{ overdrive: syncRate > 100 }">{{ syncRate }}%</span>
        <span class="sync-badge" v-if="syncRate > 100">⚠ OVERLOAD</span>
      </div>
      <div class="sync-bar" :class="{ overdrive: syncRate > 100 }">
        <div class="sync-fill" :style="{ width: Math.min(syncRate, 120) + '%' }"></div>
        <div class="sync-scan"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sys-monitor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.monitor-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.monitor-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.monitor-icon { font-size: 14px; flex-shrink: 0; }
.monitor-name { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.monitor-sub { font-size: 11px; color: var(--text-tertiary); margin-left: auto; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }

.monitor-bar {
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  overflow: hidden;
}

.monitor-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s ease, background 0.4s ease;
  min-width: 2px;
}

.gpu-extras {
  display: flex;
  gap: 12px;
  font-size: 10px;
  color: var(--text-tertiary);
}

/* Pulse at high load */
.pulse-bar {
  animation: pulse-bar-glow 1s ease-in-out infinite;
}
@keyframes pulse-bar-glow {
  0%, 100% { box-shadow: 0 0 4px currentColor; opacity: 1; }
  50% { box-shadow: 0 0 12px currentColor; opacity: 0.85; }
}

.uptime-row {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--border-subtle);
}

/* ── SYNC RATE HUD ── */
.sync-rate-section { margin-top: 6px; }
.sync-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.sync-icon { font-size: 13px; }
.sync-label { font-size: 11px; font-weight: 700; color: var(--text-secondary); letter-spacing: 0.1em; font-family: var(--font-mono); }
.sync-value { font-size: 13px; font-weight: 800; color: #f472b6; margin-left: auto; font-family: var(--font-mono); transition: color 0.5s; }
.sync-value.overdrive { color: #FF007F; animation: sync-pulse 0.3s infinite; }
.sync-badge { font-size: 8px; font-weight: 700; color: #FF007F; background: rgba(255,0,127,0.12); padding: 1px 6px; border-radius: var(--radius-full); animation: sync-pulse 0.4s infinite; }
@keyframes sync-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

.sync-bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; position: relative; }
.sync-fill { height: 100%; background: linear-gradient(90deg, #f472b6, #fb923c); border-radius: 2px; transition: width 0.5s ease, background 0.5s; }
.sync-bar.overdrive .sync-fill { background: linear-gradient(90deg, #FF007F, #FF69B4, #FF007F); background-size: 200% 100%; animation: overdrive-flow 0.5s linear infinite; }
@keyframes overdrive-flow { 0%{background-position:0 0} 100%{background-position:200% 0} }
.sync-scan { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); animation: scan-line 2s linear infinite; }
@keyframes scan-line { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
</style>

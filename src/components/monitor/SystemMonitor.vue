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
let timer: ReturnType<typeof setInterval> | null = null

async function refresh() {
  if (!window.systemAPI) return
  try { stats.value = await window.systemAPI.getStats() } catch (_) {}
}

onMounted(() => { refresh(); timer = setInterval(refresh, 2000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

function barColor(percent: number): string {
  if (percent > 85) return '#f87171'
  if (percent > 60) return '#fbbf24'
  return '#34d399'
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
        <div class="monitor-fill progress-flow" :style="{ width: stats.cpu.usage + '%', background: barColor(stats.cpu.usage) }"></div>
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
        <div class="monitor-fill progress-flow" :style="{ width: stats.memory.percent + '%', background: barColor(stats.memory.percent) }"></div>
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
        <div class="monitor-fill" :style="{ width: stats.gpu.vramPercent + '%', background: barColor(stats.gpu.vramPercent) }"></div>
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

.uptime-row {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--border-subtle);
}
</style>

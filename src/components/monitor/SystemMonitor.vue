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

function barColor(p: number): string {
  if (p > 85) return 'var(--accent-danger)'
  if (p > 60) return 'var(--accent-warning)'
  return 'var(--accent-success)'
}
function fmtMem(mb: number): string {
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB'
}
</script>

<template>
  <div class="mon-set" v-if="stats">
    <!-- CPU -->
    <div class="mon-card">
      <div class="mon-ic">🧠</div>
      <div class="mon-main">
        <div class="mon-top">
          <span class="mon-name">CPU</span>
          <span :key="`cpu-${stats.cpu.usage}`" class="mon-val">{{ stats.cpu.usage }}<i>%</i></span>
        </div>
        <div class="mon-bar">
          <div class="mon-fill"
               :style="{ width: stats.cpu.usage + '%', background: barColor(stats.cpu.usage) }"></div>
        </div>
        <div class="mon-sub">{{ stats.cpu.cores }} 核 · 实时负载</div>
      </div>
    </div>

    <!-- GPU -->
    <div class="mon-card" v-if="stats.gpu">
      <div class="mon-ic">🎮</div>
      <div class="mon-main">
        <div class="mon-top">
          <span class="mon-name">GPU</span>
          <span :key="`gpu-${stats.gpu.vramTotal > 0 ? stats.gpu.vramPercent : (stats.gpu.usage || 0)}`" class="mon-val">{{ stats.gpu.vramTotal > 0 ? stats.gpu.vramPercent : (stats.gpu.usage || 0) }}<i>%</i></span>
        </div>
        <div class="mon-bar" v-if="stats.gpu.vramTotal > 0">
          <div class="mon-fill"
               :style="{ width: stats.gpu.vramPercent + '%', background: barColor(stats.gpu.vramPercent) }"></div>
        </div>
        <div class="mon-bar" v-else>
          <div class="mon-fill" :style="{ width: (stats.gpu.usage || 0) + '%', background: barColor(stats.gpu.usage || 0) }"></div>
        </div>
        <div class="mon-sub">
          <template v-if="stats.gpu.vramTotal > 0">{{ fmtMem(stats.gpu.vramUsed) }} / {{ fmtMem(stats.gpu.vramTotal) }} 显存</template>
          <template v-else>{{ stats.gpu.name?.slice(0, 18) || 'GPU' }}</template>
          <span v-if="stats.gpu.temp > 0"> · {{ stats.gpu.temp }}°C</span>
        </div>
      </div>
    </div>

    <!-- RAM (内存) -->
    <div class="mon-card">
      <div class="mon-ic">💾</div>
      <div class="mon-main">
        <div class="mon-top">
          <span class="mon-name">RAM</span>
          <span :key="`ram-${stats.memory.percent}`" class="mon-val">{{ stats.memory.percent }}<i>%</i></span>
        </div>
        <div class="mon-bar">
          <div class="mon-fill"
               :style="{ width: stats.memory.percent + '%', background: barColor(stats.memory.percent) }"></div>
        </div>
        <div class="mon-sub">{{ fmtMem(stats.memory.used) }} / {{ fmtMem(stats.memory.total) }} 内存</div>
      </div>
    </div>
  </div>

  <div class="mon-empty" v-else>
    <span class="mon-ic">📡</span>
    <p>正在连接系统传感器…</p>
  </div>
</template>

<style scoped>
.mon-set { display: flex; flex-direction: column; gap: 12px; }

.mon-card {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px;
  background: var(--glass-bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-base), background var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base);
}
.mon-card:hover {
  border-color: var(--border-accent);
  background: var(--glass-bg-hover);
  transform: translateY(-2px);
  box-shadow: var(--elev-1);
}

.mon-ic {
  width: 44px; height: 44px; flex-shrink: 0;
  display: grid; place-items: center; font-size: 21px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb),0.20), rgba(var(--accent-secondary-rgb),0.08));
  border: 1px solid rgba(var(--accent-primary-rgb),0.20);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
}

.mon-main { flex: 1; min-width: 0; }
.mon-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.mon-name { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: var(--text-secondary); font-family: var(--font-mono); }
.mon-val { font-size: 20px; font-weight: 800; color: var(--text-primary); font-family: var(--font-mono); font-variant-numeric: tabular-nums; line-height: 1; animation: value-update 260ms ease-out; }
.mon-val i { font-size: 12px; font-weight: 600; color: var(--text-tertiary); font-style: normal; margin-left: 1px; }

@keyframes value-update {
  from { color: var(--brand-primary); transform: translateY(-1px) scale(1.035); }
  to { color: var(--text-primary); transform: translateY(0) scale(1); }
}

.mon-bar { height: 6px; background: rgba(255,255,255,0.06); border-radius: 99px; overflow: hidden; margin: 7px 0 5px; }
.mon-fill { height: 100%; border-radius: 99px; transition: width 0.6s ease, background 0.4s ease; min-width: 3px; }

.mon-sub { font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

.mon-empty { display: flex; align-items: center; gap: 12px; padding: 14px 16px; color: var(--text-tertiary); font-size: 12px; }
.mon-empty .mon-ic { width: 38px; height: 38px; font-size: 18px; }

/* ── Light theme ── */
[data-theme="light"] .mon-card { background: #fff; border-color: rgba(236,72,153,0.14); box-shadow: var(--shadow-sm); }
[data-theme="light"] .mon-card:hover { border-color: rgba(236,72,153,0.35); box-shadow: var(--shadow-md); }
[data-theme="light"] .mon-ic { background: linear-gradient(135deg, rgba(236,72,153,0.12), rgba(249,115,22,0.06)); border-color: rgba(236,72,153,0.22); }
[data-theme="light"] .mon-name { color: #6b4a60; }
[data-theme="light"] .mon-val { color: #2a1326; }
[data-theme="light"] .mon-bar { background: rgba(236,72,153,0.1); }

@media (prefers-reduced-motion: reduce) {
  .mon-val { animation: none; }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface SysStats {
  cpu: { usage: number; cores: number; model: string }
  memory: { used: number; total: number; percent: number }
  gpu: { name: string; vramUsed: number; vramTotal: number; vramPercent: number; temp: number; usage: number } | null
  uptime: number
  platform: string
}

const stats = ref<SysStats | null>(null)
let timer: ReturnType<typeof setInterval> | null = null
let inFlight = false

async function refresh() {
  if (!window.systemAPI || inFlight) return
  inFlight = true
  try { stats.value = await window.systemAPI.getStats() } catch { /* 传感器暂时不可用 */ } finally { inFlight = false }
}

onMounted(() => { void refresh(); timer = setInterval(refresh, 2500) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

function fmtGb(mb: number) { return (mb / 1024).toFixed(1) }
const gpuPercent = computed(() => {
  const gpu = stats.value?.gpu
  if (!gpu) return 0
  return gpu.vramTotal > 0 ? gpu.vramPercent : (gpu.usage || 0)
})
const bubble = computed(() => {
  if (!stats.value) return '正在连接传感器…'
  if (!stats.value.gpu) return '没检测到独立显卡，先用 CPU 干活吧'
  if (gpuPercent.value < 20) return '显卡很闲，可以开训练啦'
  if (gpuPercent.value < 70) return '显卡在忙，但还有余量'
  return '显卡快满了，先别再开新任务'
})
</script>

<template>
  <section class="rings-card" aria-labelledby="rings-title">
    <span class="rings-card__bubble">{{ bubble }}</span>
    <header>
      <h2 id="rings-title">系统</h2>
      <span v-if="stats?.gpu" class="rings-card__gpu">{{ stats.gpu.name }}<template v-if="stats.gpu.temp > 0"> · {{ stats.gpu.temp }} °C</template></span>
    </header>
    <div class="rings" :class="{ 'rings--loading': !stats }">
      <div class="ring ring--cpu" :style="{ '--p': stats ? stats.cpu.usage : 0 }">
        <div class="ring__donut"><b>{{ stats ? stats.cpu.usage : '–' }}%</b></div>
        <small>CPU</small>
        <i>{{ stats ? `${stats.cpu.cores} 核` : '' }}</i>
      </div>
      <div class="ring ring--gpu" :style="{ '--p': gpuPercent }">
        <div class="ring__donut"><b>{{ stats?.gpu ? `${gpuPercent}%` : '–' }}</b></div>
        <small>GPU</small>
        <i>{{ stats?.gpu && stats.gpu.vramTotal > 0 ? `${fmtGb(stats.gpu.vramUsed)} / ${fmtGb(stats.gpu.vramTotal)} GB` : (stats?.gpu ? '显存未知' : '无') }}</i>
      </div>
      <div class="ring ring--ram" :style="{ '--p': stats ? stats.memory.percent : 0 }">
        <div class="ring__donut"><b>{{ stats ? stats.memory.percent : '–' }}%</b></div>
        <small>RAM</small>
        <i>{{ stats ? `${fmtGb(stats.memory.used)} / ${fmtGb(stats.memory.total)} GB` : '' }}</i>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rings-card { position: relative; padding: 22px 24px 20px; border-radius: var(--radius-hero); background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.rings-card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rings-card h2 { font-size: 15px; font-weight: 900; }
.rings-card__gpu { font-family: var(--font-mono); font-size: 11px; color: var(--ink-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rings-card__bubble {
  position: absolute; right: -10px; top: -18px; padding: 8px 14px; border-radius: 999px 999px 999px 6px;
  background: var(--ink-primary); color: var(--surface-primary); font-size: 11.5px; font-weight: 700; box-shadow: var(--ink-shadow); transform: rotate(3deg); max-width: 80%;
}
.rings { display: flex; justify-content: space-between; margin-top: 18px; gap: 8px; }
.rings--loading .ring__donut { opacity: 0.55; }
.ring { width: 88px; text-align: center; }
.ring__donut {
  width: 78px; height: 78px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; position: relative;
  background: conic-gradient(var(--ring-color) 0 calc(var(--p, 0) * 1%), var(--ring-track) calc(var(--p, 0) * 1%) 100%);
  transition: background 0.6s ease;
}
.ring__donut::before { content: ""; width: 58px; height: 58px; border-radius: 50%; background: var(--surface-primary); }
.ring__donut b { position: absolute; font-family: var(--font-mono); font-size: 14px; font-weight: 800; color: var(--ink-primary); }
.ring small { display: block; margin-top: 8px; font-size: 11px; font-weight: 800; color: var(--ink-tertiary); letter-spacing: 0.06em; }
.ring i { display: block; font-style: normal; font-family: var(--font-mono); font-size: 10px; color: var(--ink-quaternary); margin-top: 2px; white-space: nowrap; }
.ring--cpu { --ring-color: var(--brand-primary); --ring-track: var(--brand-soft); }
.ring--gpu { --ring-color: var(--accent-lavender); --ring-track: var(--accent-lavender-soft); }
.ring--ram { --ring-color: var(--accent-mint); --ring-track: var(--accent-mint-soft); }
@media (prefers-reduced-motion: reduce) { .ring__donut { transition: none; } }
</style>

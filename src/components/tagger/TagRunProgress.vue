<script setup lang="ts">
const props = defineProps<{
  phase: 'running' | 'stopping'
  completed: number
  total: number
  currentFile: string
  provider: string
}>()
defineEmits<{ stop: [] }>()

function percent() {
  return props.total ? Math.round((props.completed / props.total) * 100) : 0
}
</script>

<template>
  <div class="tag-run-progress tag-run-progress--compact">
    <div class="progress-copy">
      <span class="progress-pulse"></span>
      <div><strong>{{ phase === 'stopping' ? '正在停止' : '自动标注中' }}</strong><small>{{ currentFile ? currentFile.split(/[/\\]/).pop() : '正在准备模型' }} · {{ provider || '等待设备' }}</small></div>
      <span>{{ completed }} / {{ total }}</span>
    </div>
    <div class="progress-track"><i :style="{ width: `${percent()}%` }"></i></div>
    <button :disabled="phase === 'stopping'" @click="$emit('stop')">{{ phase === 'stopping' ? '请稍等…' : '停止任务' }}</button>
  </div>
</template>

<style scoped>
.tag-run-progress { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px 12px; padding: 10px 16px; border: 0; border-radius: 999px; background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.progress-copy { min-width: 0; display: flex; align-items: center; gap: 10px; }
.progress-pulse { width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--accent-peach); box-shadow: 0 0 0 3px var(--accent-peach-soft); animation: pulse 1.2s ease-in-out infinite; }
.progress-copy div { min-width: 0; flex: 1; display: grid; gap: 2px; }
.progress-copy strong { color: var(--ink-primary); font-size: 12.5px; font-weight: 800; }
.progress-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-tertiary); font-size: 11px; }
.progress-copy > span:last-child { color: var(--brand-hover); font: 12px var(--font-mono); font-weight: 700; }
.progress-track { grid-column: 1; height: 6px; overflow: hidden; border-radius: 999px; background: var(--brand-soft); }
.progress-track i { display: block; height: 100%; border-radius: inherit; background: var(--brand-gradient); transition: width .2s ease; }
.tag-run-progress button { grid-column: 2; grid-row: 1 / span 2; align-self: center; height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--danger-bg); color: var(--danger-foreground); cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 800; }
.tag-run-progress button:disabled { opacity: .55; cursor: wait; }
@keyframes pulse { 50% { opacity: .35; transform: scale(.8); } }
.tag-run-progress--compact { min-height: 40px; grid-template-columns: minmax(0,1fr) 140px auto; align-items: center; gap: 12px; padding: 4px 6px 4px 16px; }
.tag-run-progress--compact .progress-copy div { display: flex; align-items: baseline; gap: 8px; }
.tag-run-progress--compact .progress-copy small { flex: 1; }
.tag-run-progress--compact .progress-track { grid-column: 2; height: 6px; }
.tag-run-progress--compact button { grid-column: 3; grid-row: 1; height: 30px; }
@media (max-width: 760px) { .tag-run-progress--compact { grid-template-columns: minmax(0,1fr) auto; } .tag-run-progress--compact .progress-track { display: none; } .tag-run-progress--compact button { grid-column: 2; } }
@media (prefers-reduced-motion: reduce) { .progress-pulse { animation: none; } .progress-track i { transition: none; } }
</style>

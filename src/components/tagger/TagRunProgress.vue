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
.tag-run-progress { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px 12px; padding: 12px 14px; border: 1px solid rgba(120,200,255,.14); border-radius: 10px; background: rgba(120,200,255,.045); }.progress-copy { min-width: 0; display: flex; align-items: center; gap: 8px; }.progress-pulse { width: 7px; height: 7px; flex: none; border-radius: 50%; background: #78c8ff; box-shadow: 0 0 10px rgba(120,200,255,.65); animation: pulse 1.2s ease-in-out infinite; }.progress-copy div { min-width: 0; flex: 1; display: grid; gap: 2px; }.progress-copy strong { color: var(--text-secondary); font-size: 10px; }.progress-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-tertiary); font-size: 8px; }.progress-copy > span:last-child { color: #78c8ff; font: 9px ui-monospace, monospace; }.progress-track { grid-column: 1; height: 3px; overflow: hidden; border-radius: 3px; background: rgba(255,255,255,.06); }.progress-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#70d6ff,var(--accent-primary)); transition: width .2s ease; }.tag-run-progress button { grid-column: 2; grid-row: 1 / span 2; align-self: center; height: 30px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(255,255,255,.03); color: var(--text-tertiary); cursor: pointer; font-size: 8px; }.tag-run-progress button:disabled { opacity: .55; cursor: wait; }@keyframes pulse { 50% { opacity: .35; transform: scale(.8); } }@media (prefers-reduced-motion: reduce) { .progress-pulse { animation: none; }.progress-track i { transition: none; } }
.tag-run-progress--compact { min-height: 34px; grid-template-columns: minmax(0,1fr) 112px auto; align-items: center; gap: 8px; padding: 0 8px; border-radius: 8px; }
.tag-run-progress--compact .progress-copy div { display: flex; align-items: baseline; gap: 7px; }
.tag-run-progress--compact .progress-copy small { flex: 1; }
.tag-run-progress--compact .progress-track { grid-column: 2; height: 3px; }
.tag-run-progress--compact button { grid-column: 3; grid-row: 1; height: 26px; }
@media (max-width: 760px) { .tag-run-progress--compact { grid-template-columns: minmax(0,1fr) auto; }.tag-run-progress--compact .progress-track { display: none; }.tag-run-progress--compact button { grid-column: 2; } }
</style>

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
.tag-run-progress { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px 12px; padding: 10px 14px; border: 1px solid #dee5d7; border-radius: 8px; background: #fcfdf9; color: #34402f; }
.progress-copy { min-width: 0; display: flex; align-items: center; gap: 10px; }
.progress-pulse { width: 8px; height: 8px; flex: none; border-radius: 50%; background: #789465; box-shadow: 0 0 0 3px #dfeadc; animation: pulse 1.2s ease-in-out infinite; }
.progress-copy div { min-width: 0; flex: 1; display: grid; gap: 2px; }
.progress-copy strong { font-size: 12.5px; font-weight: 500; }
.progress-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #788271; font-size: 11px; }
.progress-copy > span:last-child { color: #55684b; font: 12px Arial, sans-serif; font-variant-numeric: tabular-nums; }
.progress-track { grid-column: 1; height: 3px; overflow: hidden; border-radius: 3px; background: #e4e8dd; }
.progress-track i { display: block; height: 100%; border-radius: inherit; background: #9aae87; transition: width .2s ease; }
.tag-run-progress button { grid-column: 2; grid-row: 1 / span 2; align-self: center; height: 30px; padding: 0 12px; border: 1px solid #e0c9c9; border-radius: 5px; background: #fff; color: #a3474f; cursor: pointer; font: inherit; font-size: 12px; }
.tag-run-progress button:disabled { opacity: .55; cursor: wait; }
@keyframes pulse { 50% { opacity: .35; transform: scale(.8); } }
.tag-run-progress--compact { min-height: 40px; grid-template-columns: minmax(0,1fr) 140px auto; align-items: center; gap: 12px; padding: 4px 8px 4px 14px; }
.tag-run-progress--compact .progress-copy div { display: flex; align-items: baseline; gap: 8px; }
.tag-run-progress--compact .progress-copy small { flex: 1; }
.tag-run-progress--compact .progress-track { grid-column: 2; height: 3px; }
.tag-run-progress--compact button { grid-column: 3; grid-row: 1; height: 28px; }
@media (max-width: 760px) { .tag-run-progress--compact { grid-template-columns: minmax(0,1fr) auto; } .tag-run-progress--compact .progress-track { display: none; } .tag-run-progress--compact button { grid-column: 2; } }
@media (prefers-reduced-motion: reduce) { .progress-pulse { animation: none; } .progress-track i { transition: none; } }
</style>

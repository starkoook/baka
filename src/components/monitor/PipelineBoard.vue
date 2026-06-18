<script setup lang="ts">
import { computed } from 'vue'
import { usePipelineStore } from '@/stores/pipeline'

const pipeline = usePipelineStore()

const statusClass = computed(() => pipeline.currentTask ? 'running' : 'idle')
</script>

<template>
  <div class="pipeline-card glass-panel">
    <div class="pipeline-header">
      <span class="pipeline-title">⚡ 实时流水线状态</span>
      <span class="status-badge" :class="statusClass">
        {{ pipeline.currentTask ? 'Baka正在给杂鱼干活 🔥' : '主子歇着呢 💤' }}
      </span>
    </div>

    <div class="pipeline-body">
      <div v-if="pipeline.currentTask" class="active-task">
        <div class="task-row">
          <span class="task-name">📂 {{ pipeline.currentTask.name }}</span>
          <span class="task-pct">{{ pipeline.currentTask.progress }}%</span>
        </div>
        <div class="task-bar">
          <div class="task-bar-fill" :style="{ width: pipeline.currentTask.progress + '%' }"></div>
        </div>
        <div class="task-meta">
          <span>⏳ {{ pipeline.currentTask.eta }}</span>
          <span>⚡ {{ pipeline.currentTask.speed }}</span>
        </div>
      </div>

      <div v-else class="idle-box">
        <p class="idle-text">「 暂无任务。哼，杂鱼，还不快去给Baka大人导数据集！ 」</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pipeline-card { padding: 16px 18px; }
.pipeline-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.pipeline-title { font-size: 13px; font-weight: 700; color: var(--text-secondary); }
.status-badge {
  font-size: 11px; font-weight: 600; padding: 3px 10px;
  border-radius: var(--radius-full); letter-spacing: 0.02em;
}
.status-badge.running { background: rgba(244,114,182,0.12); color: var(--accent-primary); animation: badge-pulse 2s infinite; }
.status-badge.idle { background: var(--glass-bg); color: var(--text-tertiary); }
@keyframes badge-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }

.active-task { display: flex; flex-direction: column; gap: 8px; }
.task-row { display: flex; justify-content: space-between; align-items: center; }
.task-name { font-size: 12px; color: var(--text-primary); font-weight: 600; }
.task-pct { font-size: 13px; font-weight: 700; color: var(--accent-primary); font-family: var(--font-mono); }
.task-bar { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.task-bar-fill {
  height: 100%; border-radius: 3px;
  background: var(--gradient-accent);
  transition: width 0.5s ease;
  position: relative;
}
.task-bar-fill::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: bar-flow 1.5s linear infinite;
}
@keyframes bar-flow { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
.task-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-tertiary); font-family: var(--font-mono); }
.idle-box { padding: 12px 0; text-align: center; }
.idle-text { font-size: 12px; color: var(--text-tertiary); font-style: italic; }
</style>

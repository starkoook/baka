<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardAction } from '@/features/dashboard/dashboard-summary'

const props = defineProps<{
  items: Array<DashboardAction & { value: string }>
  task: { name: string; progress: number; eta: string; speed: string } | null
}>()

const emit = defineEmits<{ navigate: [route: string] }>()

const displayProgress = computed(() => {
  const taskProgress = props.task?.progress ?? 0
  return Number.isFinite(taskProgress) ? Math.min(100, Math.max(0, taskProgress)) : 0
})
</script>

<template>
  <section class="recent-work" aria-labelledby="recent-work-title">
    <header class="recent-work__header">
      <div>
        <span>最近工作</span>
        <h2 id="recent-work-title">继续创作</h2>
      </div>
    </header>

    <div class="work-list">
      <button
        v-for="item in items"
        :key="item.label"
        class="work-row"
        type="button"
        @click="emit('navigate', item.route)"
      >
        <span class="work-row__copy">
          <strong>{{ item.label }}</strong>
          <small>{{ item.value }}</small>
        </span>
        <span class="work-row__arrow" aria-hidden="true">→</span>
      </button>
    </div>

    <div v-if="task" class="active-task">
      <div class="active-task__summary">
        <span>
          <small>正在运行</small>
          <strong>{{ task.name }}</strong>
        </span>
        <b>{{ displayProgress }}%</b>
      </div>
      <div
        class="task-track"
        role="progressbar"
        :aria-label="task.name"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="displayProgress"
      >
        <i :style="{ width: `${displayProgress}%` }"></i>
      </div>
      <p>{{ task.speed }} · 预计 {{ task.eta }}</p>
    </div>
  </section>
</template>

<style scoped>
.recent-work {
  min-width: 0;
}

.recent-work__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  min-height: 48px;
  margin-bottom: 10px;
}

.recent-work__header span {
  display: block;
  margin-bottom: 5px;
  color: var(--ink-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.recent-work__header h2 {
  margin: 0;
  color: var(--ink-primary);
  font-size: 21px;
  line-height: 1.25;
}

.work-list {
  border-top: 1px solid var(--line-subtle);
}

.work-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 62px;
  padding: 12px 4px;
  border: 0;
  border-bottom: 1px solid var(--line-subtle);
  color: var(--ink-primary);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: color 140ms ease, padding 140ms ease;
}

.work-row:hover {
  padding-inline: 10px;
  color: var(--brand-primary);
}

.work-row__copy strong,
.work-row__copy small {
  display: block;
}

.work-row__copy strong {
  font-size: 14px;
  font-weight: 650;
}

.work-row__copy small {
  margin-top: 4px;
  color: var(--ink-secondary);
  font-size: 12px;
}

.work-row__arrow {
  color: var(--ink-tertiary);
  font-size: 18px;
}

.active-task {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--line-subtle);
  border-radius: var(--radius-control);
  background: var(--surface-secondary);
}

.active-task__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.active-task__summary > span {
  min-width: 0;
}

.active-task__summary small,
.active-task__summary strong {
  display: block;
}

.active-task__summary small,
.active-task p {
  color: var(--ink-tertiary);
  font-size: 11px;
}

.active-task__summary strong {
  margin-top: 4px;
  color: var(--ink-primary);
  font-size: 13px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.active-task__summary b {
  flex-shrink: 0;
  color: var(--brand-primary);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.task-track {
  height: 6px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-selected);
}

.task-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand-primary);
}

.active-task p {
  margin: 8px 0 0;
}

@media (prefers-reduced-motion: reduce) {
  .work-row {
    transition: none;
  }
}
</style>

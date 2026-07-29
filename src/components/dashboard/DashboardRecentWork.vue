<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardAction } from '@/features/dashboard/dashboard-summary'

const props = defineProps<{
  action: DashboardAction
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
        <span>当前工作</span>
        <h2 id="recent-work-title">{{ action.label }}</h2>
      </div>
      <button
        class="continue-button"
        type="button"
        :aria-label="action.label"
        @click="emit('navigate', action.route)"
      >
        继续
      </button>
    </header>

    <div class="status-strip">
      <button
        v-for="item in items"
        :key="item.label"
        class="status-segment"
        type="button"
        @click="emit('navigate', item.route)"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
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
  position: relative;
  z-index: 1;
  min-width: 0;
  padding: clamp(22px, 3vw, 36px);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  box-shadow: var(--surface-shadow);
  transform-origin: left center;
  transition: transform 180ms ease, opacity 180ms ease, filter 180ms ease;
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
  overflow-wrap: anywhere;
}

.continue-button {
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--surface-primary);
  background: var(--brand-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.continue-button:focus-visible,
.status-segment:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 3px;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.status-segment {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  min-height: 76px;
  padding: 14px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--ink-primary);
  background: color-mix(in srgb, var(--surface-secondary) 84%, var(--brand-soft));
  font: inherit;
  text-align: left;
  cursor: pointer;
  transform-origin: center;
  transition: transform 160ms ease, opacity 160ms ease, filter 160ms ease, background 160ms ease;
}

.status-segment span {
  color: var(--ink-tertiary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.status-segment strong {
  margin-top: 9px;
  color: var(--ink-primary);
  font-size: 15px;
  overflow-wrap: anywhere;
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

.recent-work:focus-within {
  z-index: 4;
  transform: translateY(-4px) scale(1.012);
}

.status-strip:has(.status-segment:focus-visible) .status-segment:not(:focus-visible) {
  opacity: 0.72;
  filter: saturate(0.72);
}

.status-segment:focus-visible {
  background: color-mix(in srgb, var(--surface-secondary) 72%, var(--brand-soft));
  transform: translateY(-3px) scale(1.02);
}

.status-segment:focus-visible:active {
  transform: scale(0.985);
}

@media (hover: hover) and (pointer: fine) {
  .recent-work:hover {
    z-index: 4;
    transform: translateY(-4px) scale(1.012);
  }

  .status-strip:not(:has(.status-segment:focus-visible)):has(.status-segment:hover) .status-segment:not(:hover) {
    opacity: 0.72;
    filter: saturate(0.72);
  }

  .status-strip:not(:has(.status-segment:focus-visible)) .status-segment:hover {
    background: color-mix(in srgb, var(--surface-secondary) 72%, var(--brand-soft));
    transform: translateY(-3px) scale(1.02);
  }

  .status-segment:hover:active {
    transform: scale(0.985);
  }
}

@media (max-width: 720px) {
  .recent-work__header {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }

  .continue-button {
    align-self: flex-start;
  }

  .status-strip {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .recent-work,
  .status-segment {
    transition: none;
  }

  .recent-work:focus-within,
  .recent-work:hover,
  .status-segment:focus-visible,
  .status-strip:not(:has(.status-segment:focus-visible)) .status-segment:hover,
  .status-segment:focus-visible:active,
  .status-segment:hover:active,
  .status-strip:has(.status-segment:focus-visible) .status-segment:not(:focus-visible),
  .status-strip:not(:has(.status-segment:focus-visible)):has(.status-segment:hover) .status-segment:not(:hover) {
    opacity: 1;
    filter: none;
    transform: none;
  }
}
</style>

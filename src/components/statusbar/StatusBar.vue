<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<template>
  <footer class="statusbar">
    <div class="status-left">
      <span
        class="status-dot"
        :class="{
          idle: appStore.status === '就绪',
          busy: appStore.status !== '就绪'
        }"
      ></span>
      <span class="status-text">{{ appStore.status }}</span>
    </div>
    <div class="status-right">
      <span class="status-item">v{{ appStore.version }}</span>
      <span class="status-sep">·</span>
      <span class="status-item">Baka TOOLS</span>
    </div>
  </footer>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--statusbar-height);
  padding: 0 14px;
  background-color: var(--bg-titlebar);
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
  font-size: 11px;
  user-select: none;
  border-radius: 0 0 12px 12px;
  position: relative;
}
/* Bottom accent dot */
.statusbar::after {
  content: '';
  position: absolute;
  bottom: 4px; left: 50%; transform: translateX(-50%);
  width: 4px; height: 4px; border-radius: 50%;
  background: rgba(var(--accent-primary-rgb), 0.2);
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 7px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-success);
  flex-shrink: 0;
}

.status-dot.idle {
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.status-dot.busy {
  background: var(--accent-warning);
  animation: pulse-glow 1.5s infinite;
}

.status-text {
  color: var(--text-secondary);
}

.status-item {
  color: var(--text-tertiary);
}

.status-sep {
  color: var(--text-disabled);
}
</style>

<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<template>
  <footer class="statusbar" :class="{ 'has-error': appStore.lastError }">
    <div class="status-left">
      <template v-if="appStore.lastError">
        <span class="status-dot error"></span>
        <span class="status-text error-text">{{ appStore.lastError }}</span>
        <button class="status-dismiss" @click="appStore.clearError()" title="消除">✕</button>
      </template>
      <template v-else>
        <span
          class="status-dot"
          :class="{
            idle: appStore.status === '就绪',
            busy: appStore.status !== '就绪'
          }"
        ></span>
        <span class="status-text">{{ appStore.status }}</span>
      </template>
    </div>
    <div class="status-right">
      <span v-if="appStore.errorCount > 0" class="status-err-badge" @click="appStore.clearError()">
        {{ appStore.errorCount }} 个报错
      </span>
      <span class="status-item">v{{ appStore.version }}</span>
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
  transition: background-color 0.3s;
}
.statusbar.has-error {
  background-color: rgba(239, 68, 68, 0.08);
  border-top-color: rgba(239, 68, 68, 0.2);
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

.status-dot.error {
  background: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
  animation: pulse-glow 1s infinite;
}

.status-text {
  color: var(--text-secondary);
}
.status-text.error-text {
  color: #fca5a5;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dismiss {
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
  flex-shrink: 0;
}
.status-dismiss:hover { color: #fca5a5; }

.status-err-badge {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  cursor: pointer;
}
.status-err-badge:hover { background: rgba(239, 68, 68, 0.25); }

.status-item {
  color: var(--text-tertiary);
}

.status-sep {
  color: var(--text-disabled);
}
</style>

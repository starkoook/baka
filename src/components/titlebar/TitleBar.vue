<script setup lang="ts">
import { ref, onMounted } from 'vue'

const isMaximized = ref(false)

function handleMinimize() { window.windowAPI?.minimize() }
function handleMaximize() { window.windowAPI?.maximize() }
function handleClose() { window.windowAPI?.close() }

onMounted(() => {
  window.windowAPI?.onMaximizeChange((maximized: boolean) => {
    isMaximized.value = maximized
  })
})
</script>

<template>
  <header class="titlebar" @dblclick="handleMaximize">
    <div class="titlebar-drag">
      <span class="titlebar-logo">
        <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span class="titlebar-text text-gradient">Baka TOOLS</span>
        <span class="titlebar-dots">
          <i></i><i></i><i></i>
        </span>
      </span>
    </div>
    <div class="titlebar-controls">
      <button class="ctrl-btn" @click="handleMinimize" title="最小化">
        <svg viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
      </button>
      <button class="ctrl-btn" @click="handleMaximize" :title="isMaximized ? '还原' : '最大化'">
        <svg v-if="!isMaximized" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>
        <svg v-else viewBox="0 0 12 12"><rect x="2" y="0" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="3.5" width="8" height="8" rx="1" fill="var(--bg-primary)" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button class="ctrl-btn ctrl-close" @click="handleClose" title="关闭">
        <svg viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--titlebar-height);
  background-color: var(--bg-titlebar);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  user-select: none;
  position: relative;
  border-radius: 12px 12px 0 0;
}

/* Top accent glow line */
.titlebar::before {
  content: '';
  position: absolute;
  top: 0; left: 12px; right: 12px;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(var(--accent-primary-rgb), 0.3) 20%, rgba(var(--accent-primary-rgb), 0.5) 50%, rgba(var(--accent-primary-rgb), 0.3) 80%, transparent 100%);
}

.titlebar-drag {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
  padding-left: 16px;
}

.titlebar-logo {
  display: flex;
  align-items: center;
  gap: 9px;
}

/* Decorative dots */
.titlebar-dots { display: flex; gap: 4px; margin-left: 6px; }
.titlebar-dots i {
  width: 3px; height: 3px; border-radius: 50%;
  background: rgba(var(--accent-primary-rgb), 0.4);
  display: block;
}

.logo-icon {
  width: 18px;
  height: 18px;
  color: var(--accent-primary);
}

.titlebar-text {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.titlebar-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.ctrl-btn:hover {
  background: var(--glass-bg);
  color: var(--text-primary);
}

.ctrl-btn svg { width: 12px; height: 12px; }
.ctrl-close:hover { background: #e81123; color: #fff; }
</style>

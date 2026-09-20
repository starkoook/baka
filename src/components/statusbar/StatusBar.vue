<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()

function openConsole() {
  void router.push('/console')
}
</script>

<template>
  <footer class="statusbar" :class="{ 'has-error': appStore.lastError }">
    <div class="status-left">
      <template v-if="appStore.lastError">
        <span class="status-dot error" aria-hidden="true"></span>
        <button class="status-text error-text" type="button" role="alert" title="打开控制台" @click="openConsole">{{ appStore.lastError }}</button>
        <button class="status-dismiss" type="button" @click="appStore.clearError()" title="清除错误">清除</button>
      </template>
      <template v-else>
        <span class="status-dot" :class="{ idle: appStore.status === '就绪', busy: appStore.status !== '就绪' }" aria-hidden="true"></span>
        <span class="status-text">{{ appStore.status }}</span>
      </template>
    </div>
    <div class="status-right">
      <button v-if="appStore.errorCount > 0" class="status-err-badge" type="button" @click="openConsole">
        {{ appStore.errorCount }} 个错误
      </button>
      <button class="status-console" type="button" title="打开控制台" @click="openConsole">控制台</button>
      <span class="status-item">v{{ appStore.version }}</span>
    </div>
  </footer>
</template>

<style scoped>
.statusbar { display: flex; align-items: center; justify-content: space-between; height: var(--statusbar-height); padding: 0 14px; flex-shrink: 0; background: transparent; border: 0; border-radius: 0 0 12px 12px; color: var(--text-secondary); font-size: 11px; user-select: none; }
.statusbar.has-error { background: var(--danger-bg); border: 0; }
.status-left, .status-right { display: flex; align-items: center; gap: 7px; }
.status-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--accent-success); }
.status-dot.busy { background: var(--accent-warning); }
.status-dot.error { background: var(--accent-danger); }
.status-text { color: var(--text-secondary); }
.status-text.error-text { max-width: 400px; overflow: hidden; color: var(--danger-foreground); text-overflow: ellipsis; white-space: nowrap; }
.status-dismiss, .status-err-badge { border: 0; cursor: pointer; font: inherit; }
.status-dismiss { padding: 0 4px; background: none; color: var(--danger-foreground); }
.status-dismiss:hover { color: var(--danger-foreground); text-decoration: underline; }
.status-err-badge { padding: 2px 8px; border-radius: 10px; background: var(--danger-bg); color: var(--danger-foreground); font-size: 10px; }
.status-err-badge:hover { background: rgba(239, 68, 68, .18); }
.status-item { color: var(--text-secondary); }
.status-text.error-text { background: none; border: 0; padding: 0; font: inherit; cursor: pointer; text-align: left; }
.status-console { border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-size: 11px; cursor: pointer; padding: 2px 6px; border-radius: 8px; }
.status-console:hover { background: var(--brand-soft); color: var(--brand-primary); }
</style>

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
.statusbar { position: absolute; z-index: 2; left: var(--sidebar-width); right: 0; bottom: 0; display: flex; align-items: center; justify-content: space-between; height: var(--statusbar-height); padding: 0 22px 0 12px; color: var(--ink-tertiary); font-family: var(--font-mono); font-size: 10.5px; user-select: none; }
.status-left, .status-right { display: flex; align-items: center; gap: 10px; }
.status-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--accent-mint); }
.status-dot.busy { background: var(--accent-peach); }
.status-dot.error { background: var(--accent-rose); }
.status-text { color: var(--ink-tertiary); }
.status-text.error-text { max-width: 420px; overflow: hidden; color: var(--danger-foreground); text-overflow: ellipsis; white-space: nowrap; background: none; border: 0; padding: 0; font: inherit; cursor: pointer; text-align: left; }
.status-dismiss, .status-err-badge { border: 0; cursor: pointer; font: inherit; }
.status-dismiss { padding: 0 4px; background: none; color: var(--danger-foreground); }
.status-dismiss:hover { text-decoration: underline; }
.status-err-badge { padding: 2px 9px; border-radius: 999px; background: var(--danger-bg); color: var(--danger-foreground); font-size: 10px; }
.status-item { color: var(--ink-quaternary); }
.status-console { border: 0; background: transparent; color: var(--ink-tertiary); font: inherit; cursor: pointer; padding: 2px 8px; border-radius: 999px; }
.status-console:hover { background: var(--brand-soft); color: var(--brand-hover); }
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const isMaximized = ref(false)
const router = useRouter()

function handleMinimize() { window.windowAPI?.minimize() }
function handleMaximize() { window.windowAPI?.maximize() }
function handleClose() { window.windowAPI?.close() }
function openSettings() { void router.push('/settings') }

function onTitlebarDblClick(event: MouseEvent) {
  if ((event.target as HTMLElement | null)?.closest('.titlebar-controls')) return
  handleMaximize()
}

onMounted(() => {
  window.windowAPI?.onMaximizeChange((maximized: boolean) => {
    isMaximized.value = maximized
  })
})
</script>

<template>
  <header class="titlebar" @dblclick="onTitlebarDblClick">
    <div class="titlebar-drag">
      <span class="titlebar-logo">
        <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 2 2 7l10 5 10-5-10-5Z" />
          <path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <span class="titlebar-text">Baka TOOLS</span>
      </span>
    </div>
    <div class="titlebar-controls">
      <button class="ctrl-btn ctrl-settings" type="button" @click="openSettings" title="设置" aria-label="设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.2 2.2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.2-2.2.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4.6v-3.2h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L6 7.8l2.2-2.2.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h3.2v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.2 2.2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V14h-.2a1.7 1.7 0 0 0-1.4 1Z" />
        </svg>
      </button>
      <button class="ctrl-btn" type="button" @click="handleMinimize" title="最小化" aria-label="最小化">
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="5.5" width="10" height="1" fill="currentColor" /></svg>
      </button>
      <button class="ctrl-btn" type="button" @click="handleMaximize" :title="isMaximized ? '还原' : '最大化'" :aria-label="isMaximized ? '还原' : '最大化'">
        <svg v-if="!isMaximized" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1" /></svg>
        <svg v-else viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="0" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1" /><rect x=".5" y="3.5" width="8" height="8" rx="1" fill="var(--bg-primary)" stroke="currentColor" stroke-width="1" /></svg>
      </button>
      <button class="ctrl-btn ctrl-close" type="button" @click="handleClose" title="关闭" aria-label="关闭">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m1 1 10 10M11 1 1 11" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar { display: flex; align-items: center; justify-content: space-between; height: var(--titlebar-height); flex-shrink: 0; background: transparent; border: 0; border-radius: 12px 12px 0 0; user-select: none; }
.titlebar-drag { display: flex; flex: 1; align-items: center; height: 100%; padding-left: 16px; -webkit-app-region: drag; }
.titlebar-logo { display: flex; align-items: center; gap: 9px; }
.logo-icon { width: 18px; height: 18px; color: var(--accent-primary); }
.titlebar-text { color: var(--text-primary); font-size: 13px; font-weight: 700; letter-spacing: .5px; }
.titlebar-controls { display: flex; height: 100%; -webkit-app-region: no-drag; }
.ctrl-btn { display: flex; align-items: center; justify-content: center; width: 46px; height: 100%; border: 0; background: transparent; color: var(--text-tertiary); cursor: pointer; transition: background-color .15s ease, color .15s ease; }
.ctrl-btn:hover { background: var(--surface-secondary); color: var(--text-primary); }
.ctrl-btn svg { width: 12px; height: 12px; }
.ctrl-close:hover { background: #e81123; color: #fff; }
</style>

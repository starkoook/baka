<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { findToolByRoute } from '@/features/tools/tool-catalog'
import { useAppStore } from '@/stores/app'

const isMaximized = ref(false)
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const SUB_LABELS: Record<string, string> = {
  '/training/run': '运行',
  '/training/runtime': '运行环境',
  '/video/convert': '转换',
  '/video/extract': '抽帧',
}

const crumb = computed(() => {
  if (route.path === '/') return { root: '首页', sub: '' }
  if (route.path === '/settings') return { root: '设置', sub: '' }
  const tool = findToolByRoute(route.path)
  if (tool) return { root: tool.label, sub: SUB_LABELS[route.path] ?? '' }
  return { root: String(route.name ?? route.path), sub: '' }
})

function handleMinimize() { window.windowAPI?.minimize() }
function handleMaximize() { window.windowAPI?.maximize() }
function handleClose() { window.windowAPI?.close() }
function openConsole() { void router.push('/console') }
function openSearch() { appStore.openToolPicker({ focusSearch: true }) }

onMounted(() => {
  window.windowAPI?.onMaximizeChange((maximized: boolean) => {
    isMaximized.value = maximized
  })
})
</script>

<template>
  <header class="titlebar">
    <div class="titlebar__crumb" aria-label="当前位置">
      <span v-if="route.path === '/'" class="titlebar__flower" aria-hidden="true">✿</span>
      <b>{{ crumb.root }}</b>
      <template v-if="crumb.sub"><i aria-hidden="true">/</i><span>{{ crumb.sub }}</span></template>
    </div>

    <button class="titlebar__search" type="button" aria-label="搜索工具（Ctrl K）" @click="openSearch">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <span>搜索工具、动作…</span>
      <kbd>Ctrl K</kbd>
    </button>

    <div class="titlebar__right">
      <button v-if="appStore.lastError" class="titlebar__pill titlebar__pill--error" type="button" :title="appStore.lastError" @click="openConsole">
        <i class="titlebar__dot titlebar__dot--error" aria-hidden="true"></i>
        <span class="titlebar__error-text">{{ appStore.lastError }}</span>
      </button>
      <span v-else class="titlebar__pill">
        <i class="titlebar__dot" :class="{ 'titlebar__dot--busy': appStore.status !== '就绪' }" aria-hidden="true"></i>
        {{ appStore.status }}
      </span>
      <div class="titlebar__controls">
        <button class="ctrl-btn" type="button" @click="handleMinimize" title="最小化" aria-label="最小化">
          <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="5.5" width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button class="ctrl-btn" type="button" @click="handleMaximize" :title="isMaximized ? '还原' : '最大化'" :aria-label="isMaximized ? '还原' : '最大化'">
          <svg v-if="!isMaximized" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.1" /></svg>
          <svg v-else viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="0" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1" /><rect x=".5" y="3.5" width="8" height="8" rx="1.5" fill="var(--surface-primary)" stroke="currentColor" stroke-width="1" /></svg>
        </button>
        <button class="ctrl-btn ctrl-close" type="button" @click="handleClose" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m1 1 10 10M11 1 1 11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  position: absolute; z-index: 4; top: 0; left: var(--sidebar-width); right: 0;
  height: var(--titlebar-height);
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px;
  padding: 0 14px 0 4px;
  -webkit-app-region: drag; user-select: none;
}
.titlebar__crumb {
  justify-self: start; display: inline-flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 16px 0 14px; border-radius: var(--radius-pill);
  background: var(--chrome-bg); backdrop-filter: blur(12px); box-shadow: var(--surface-shadow);
  color: var(--ink-tertiary); font-size: 13px; font-weight: 600; -webkit-app-region: no-drag;
}
.titlebar__crumb b { color: var(--ink-primary); font-weight: 800; }
.titlebar__crumb i { color: var(--ink-quaternary); font-style: normal; }
.titlebar__flower { color: var(--brand-primary); }
.titlebar__search {
  width: min(420px, 32vw); height: 38px; padding: 0 8px 0 16px; border: 0; border-radius: var(--radius-pill);
  background: var(--chrome-bg); backdrop-filter: blur(12px); box-shadow: var(--surface-shadow);
  display: flex; align-items: center; gap: 10px; color: var(--ink-tertiary); font: inherit; font-size: 12.5px;
  cursor: pointer; transition: box-shadow 160ms ease, transform 160ms var(--ease-bounce);
}
.titlebar__search:hover { box-shadow: var(--surface-shadow-lg); transform: translateY(-1px); }
.titlebar__search svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 1.9; stroke-linecap: round; }
.titlebar__search span { flex: 1; text-align: left; }
.titlebar__search kbd { font-family: var(--font-mono); font-size: 10px; padding: 2px 7px; border-radius: 6px; background: var(--brand-tint); color: var(--ink-secondary); }
.titlebar__right { justify-self: end; display: flex; align-items: center; gap: 8px; }
.titlebar__pill {
  display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; border: 0;
  border-radius: var(--radius-pill); background: var(--chrome-bg); backdrop-filter: blur(12px); box-shadow: var(--shadow-sm);
  font-family: var(--font-mono); font-size: 11px; color: var(--ink-secondary); max-width: 320px; -webkit-app-region: no-drag;
}
.titlebar__pill--error { cursor: pointer; color: var(--danger-foreground); background: var(--danger-bg); }
.titlebar__error-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.titlebar__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-mint); box-shadow: 0 0 0 3px var(--accent-mint-soft); flex: none; }
.titlebar__dot--busy { background: var(--accent-peach); box-shadow: 0 0 0 3px var(--accent-peach-soft); }
.titlebar__dot--error { background: var(--accent-rose); box-shadow: 0 0 0 3px rgba(255, 107, 139, 0.2); }
.titlebar__controls { display: flex; gap: 2px; margin-left: 4px; -webkit-app-region: no-drag; }
.ctrl-btn {
  width: 32px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 50%;
  background: transparent; color: var(--ink-tertiary); cursor: pointer; transition: background-color 140ms ease, color 140ms ease;
}
.ctrl-btn:hover { background: var(--chrome-bg); color: var(--ink-primary); }
.ctrl-btn svg { width: 12px; height: 12px; }
.ctrl-close:hover { background: var(--accent-rose); color: #fff; }
@media (max-width: 1180px) { .titlebar__search { width: 260px; } .titlebar__search kbd { display: none; } }
</style>

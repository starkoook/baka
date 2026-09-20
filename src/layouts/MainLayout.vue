<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import TitleBar from '@/components/titlebar/TitleBar.vue'
import AppSidebar from '@/components/sidebar/AppSidebar.vue'
import StatusBar from '@/components/statusbar/StatusBar.vue'
import ToolPicker from '@/components/sidebar/ToolPicker.vue'
import { useAppLogs } from '@/composables/useAppLogs'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()
const lockPageScroll = computed(() => route.path === '/gallery' || route.path === '/tagger')
useAppLogs()

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** Ctrl/⌘ + K：任何页面都能唤起工具选择并直接输入搜索。 */
function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    appStore.openToolPicker({ focusSearch: true })
    return
  }
  if (event.key === 'Escape' && appStore.toolPickerOpen && !isTypingTarget(event.target)) {
    appStore.closeToolPicker()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <div class="main-layout">
    <div class="ambient" aria-hidden="true">
      <i class="ambient__blob ambient__blob--1"></i>
      <i class="ambient__blob ambient__blob--2"></i>
      <i class="ambient__blob ambient__blob--3"></i>
      <i class="ambient__dots"></i>
    </div>
    <TitleBar />
    <AppSidebar />
    <main class="main-content" :class="{ 'scroll-locked': lockPageScroll }">
      <slot />
    </main>
    <StatusBar />
    <ToolPicker />
  </div>
</template>

<style scoped>
.main-layout {
  position: relative;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg);
  border-radius: 22px;
}

/* 静态光斑 + 中央一点点圆点纹理，没有任何动画 */
.ambient { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.ambient__blob { position: absolute; border-radius: 50%; }
.ambient__blob--1 { width: 640px; height: 640px; right: -160px; top: -260px; background: var(--blob-1); }
.ambient__blob--2 { width: 560px; height: 560px; left: -180px; bottom: -220px; background: var(--blob-2); }
.ambient__blob--3 { width: 420px; height: 420px; left: 46%; bottom: -200px; background: var(--blob-3); }
.ambient__dots {
  position: absolute; inset: 0;
  background-image: radial-gradient(var(--dots-color) 1px, transparent 1.2px);
  background-size: 26px 26px;
  -webkit-mask-image: radial-gradient(60% 60% at 50% 50%, #000 20%, transparent 100%);
  mask-image: radial-gradient(60% 60% at 50% 50%, #000 20%, transparent 100%);
}

.main-content {
  position: absolute;
  z-index: 1;
  top: var(--titlebar-height);
  left: var(--sidebar-width);
  right: 0;
  bottom: var(--statusbar-height);
  min-width: 0;
  overflow: auto;
  padding: 6px 24px 18px 12px;
}

.main-content.scroll-locked {
  overflow: hidden;
  padding: 4px 16px 12px 10px;
}

@media (prefers-reduced-motion: reduce) {
  .main-content { scroll-behavior: auto; }
}
</style>

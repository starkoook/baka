<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { APP_NAVIGATION, isNavigationItemActive } from '@/features/navigation/app-navigation'
import { useAppStore } from '@/stores/app'
import { createSidebarLayout } from './sidebar-layout'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const toolsItem = APP_NAVIGATION.find((item) => item.id === 'tools')

function isToolsRoute(path: string) {
  return toolsItem ? isNavigationItemActive(toolsItem, path) : false
}

const isToolsExpanded = ref(isToolsRoute(route.path))
const activeNavigationIndex = computed(() => {
  const index = APP_NAVIGATION.findIndex((item) => isNavigationItemActive(item, route.path))
  return index >= 0 ? index : 0
})
const toolsIndex = toolsItem ? APP_NAVIGATION.indexOf(toolsItem) : -1
const toolSubnavChildCount = toolsItem?.children?.length ?? 0
const { flowOffset: toolSubnavFlowOffset, style: sidebarLayoutStyle } = createSidebarLayout(toolSubnavChildCount)
const activeRailAfterExpandedTools = computed(
  () =>
    toolSubnavFlowOffset > 0
    && isToolsExpanded.value
    && toolsIndex >= 0
    && activeNavigationIndex.value > toolsIndex,
)
const activeRailStyle = computed(() => ({
  '--active-navigation-index': String(activeNavigationIndex.value),
  ...sidebarLayoutStyle,
}))

watch(
  () => route.path,
  (path) => {
    isToolsExpanded.value = isToolsRoute(path)
  },
)

function navigateTo(path: string) {
  router.push(path)
}

function toggleTools() {
  isToolsExpanded.value = !isToolsExpanded.value
}
</script>

<template>
  <aside class="app-sidebar" aria-label="主导航">
    <button class="sidebar-brand" type="button" aria-label="Baka TOOLS 首页" title="Baka TOOLS 首页" @click="navigateTo('/')">
      <span class="brand-mark">B</span>
      <span class="brand-name">Baka TOOLS</span>
    </button>

    <nav
      class="sidebar-nav"
      :style="activeRailStyle"
      :class="{ 'tools-expanded': isToolsExpanded, 'active-after-tools': activeRailAfterExpandedTools }"
      aria-label="应用页面"
    >
      <span class="sidebar-active-rail" aria-hidden="true"></span>
      <div v-for="item in APP_NAVIGATION" :key="item.id" class="nav-entry">
        <button
          class="nav-item"
          :class="{ active: isNavigationItemActive(item, route.path) }"
          :aria-current="isNavigationItemActive(item, route.path) ? 'page' : undefined"
          :aria-expanded="item.children?.length ? isToolsExpanded : undefined"
          :aria-controls="item.children?.length ? 'tools-subnavigation' : undefined"
          :aria-label="item.label"
          :title="item.label"
          type="button"
          @click="item.children?.length ? toggleTools() : navigateTo(item.route)"
        >
          <AppIcon :name="item.id" />
          <span class="nav-label">{{ item.label }}</span>
        </button>

        <div v-if="item.children?.length && isToolsExpanded" id="tools-subnavigation" class="tool-subnav" aria-label="工具子导航">
          <button
            v-for="child in item.children"
            :key="child.route"
            class="tool-subnav-item"
            :class="{ active: route.path === child.route }"
            :aria-current="route.path === child.route ? 'page' : undefined"
            type="button"
            @click="navigateTo(child.route)"
          >
            {{ child.label }}
          </button>
        </div>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="local-status" role="status">
        <span class="local-status-dot" aria-hidden="true"></span>
        <span class="local-status-label">本地模式</span>
      </div>
      <span class="sidebar-version">v{{ appStore.version }}</span>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 0; border: 0; background: color-mix(in srgb, var(--app-bg) 88%, var(--brand-soft)); }
.sidebar-brand, .nav-item, .tool-subnav-item { font: inherit; border: 0; cursor: pointer; }
.sidebar-brand { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 0 18px; background: transparent; color: var(--text-primary); text-align: left; }
.brand-mark { display: grid; width: 26px; height: 26px; flex: none; place-items: center; border-radius: 7px; background: var(--brand-primary); color: var(--brand-on-primary); font-size: 12px; font-weight: 750; }
.brand-name { overflow: hidden; font-size: 12px; font-weight: 700; letter-spacing: .02em; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-nav { position: relative; display: grid; gap: 4px; padding: 12px 10px; border: 0; }
.sidebar-active-rail { position: absolute; z-index: 2; top: 12px; left: 5px; width: 3px; height: 40px; border-radius: 999px; background: var(--brand-primary); box-shadow: 0 0 10px color-mix(in srgb, var(--brand-primary) 72%, transparent); transform: translateY(calc(var(--active-navigation-index) * 44px)); transition: transform 240ms cubic-bezier(.2, .8, .2, 1); pointer-events: none; }
.sidebar-nav.tools-expanded.active-after-tools .sidebar-active-rail { transform: translateY(calc(var(--active-navigation-index) * 44px + var(--tool-subnav-flow-offset))); }
.nav-entry { position: relative; z-index: 1; }
.nav-item { position: relative; z-index: 1; display: flex; align-items: center; width: 100%; height: 40px; min-height: 0; gap: 11px; padding: 0 10px; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); text-align: left; transition: color 160ms ease, background-color 160ms ease, transform 160ms cubic-bezier(.2, .8, .2, 1); }
.nav-item.active { background: var(--brand-soft); color: var(--brand-primary); font-weight: 650; }
.nav-item :deep(svg) { flex: none; transition: transform 160ms cubic-bezier(.2, .8, .2, 1); }
.nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: transform 160ms cubic-bezier(.2, .8, .2, 1); }
.tool-subnav { display: grid; grid-auto-rows: var(--tool-subnav-row-height); gap: var(--tool-subnav-gap); margin: var(--tool-subnav-margin-top) 0 var(--tool-subnav-margin-bottom) 21px; padding-left: 10px; border: 0; white-space: nowrap; animation: tool-subnav-enter 180ms ease-out; transform-origin: top left; }
.tool-subnav-item { min-height: var(--tool-subnav-row-height); padding: 0 8px; border-radius: 6px; background: transparent; color: var(--text-secondary); font-size: 11px; text-align: left; }
.tool-subnav-item:hover { background: var(--surface-secondary); color: var(--text-primary); }
.tool-subnav-item.active { color: var(--brand-primary); font-weight: 650; }
.sidebar-footer { display: grid; gap: 7px; margin-top: auto; padding: 13px 18px; border: 0; color: var(--text-secondary); font-size: 10px; }
.local-status { display: flex; align-items: center; gap: 6px; }
.local-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-success); animation: local-status-breathe 3.6s ease-in-out infinite; }
.sidebar-version { padding-left: 13px; }
@keyframes tool-subnav-enter {
  from { opacity: 0; transform: translateY(-4px) scale(.98); }
  to { opacity: 1; transform: none; }
}
@keyframes local-status-breathe {
  0%, 100% { opacity: .68; box-shadow: 0 0 0 color-mix(in srgb, var(--accent-success) 0%, transparent); }
  50% { opacity: 1; box-shadow: 0 0 10px color-mix(in srgb, var(--accent-success) 58%, transparent); }
}
@media (hover: hover) and (pointer: fine) {
  .sidebar-nav:not(:has(:focus-visible)) .nav-item:hover { background: var(--surface-secondary); color: var(--text-primary); transform: translateX(2px) scale(1.018); }
  .sidebar-nav:not(:has(:focus-visible)) .nav-item:hover :deep(svg) { transform: translateY(-1px) rotate(-3deg) scale(1.07); }
  .sidebar-nav:not(:has(:focus-visible)) .nav-item:hover .nav-label { transform: translateX(3px); }
  .sidebar-nav:not(:has(:focus-visible)) .nav-item:hover:active { transform: scale(.97); }
}
.nav-item:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; background: var(--surface-secondary); color: var(--text-primary); transform: translateX(2px) scale(1.018); }
.nav-item:focus-visible :deep(svg) { transform: translateY(-1px) rotate(-3deg) scale(1.07); }
.nav-item:focus-visible .nav-label { transform: translateX(3px); }
.nav-item:active { transform: scale(.97); }
@media (max-width: 1200px) {
  .sidebar-brand, .nav-item { justify-content: center; padding-inline: 0; }
  .brand-name, .nav-label, .local-status-label, .sidebar-version { display: none; }
  .sidebar-footer { justify-items: center; padding-inline: 0; }
  .sidebar-nav.tools-expanded.active-after-tools .sidebar-active-rail { transform: translateY(calc(var(--active-navigation-index) * 44px)); }
  .tool-subnav { position: absolute; top: 0; left: calc(100% + 8px); width: 164px; margin: 0; padding: 6px; border: 0; border-radius: var(--radius-control); background: color-mix(in srgb, var(--app-bg) 88%, var(--brand-soft)); box-shadow: var(--surface-shadow); }
  .tool-subnav-item { padding: 0 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .sidebar-active-rail { transition: none; }
  .nav-item,
  .nav-item :deep(svg),
  .nav-label { animation: none !important; transition: none !important; transform: none !important; }
  .tool-subnav { animation: none; transition: none; transform: none; }
  .local-status-dot { animation: none; }
}
</style>

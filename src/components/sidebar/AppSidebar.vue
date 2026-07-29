<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { APP_NAVIGATION, isNavigationItemActive } from '@/features/navigation/app-navigation'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

function isToolsRoute(path: string) {
  const toolsItem = APP_NAVIGATION.find((item) => item.id === 'tools')
  return toolsItem ? isNavigationItemActive(toolsItem, path) : false
}

const isToolsExpanded = ref(isToolsRoute(route.path))

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

    <nav class="sidebar-nav" aria-label="应用页面">
      <div v-for="item in APP_NAVIGATION" :key="item.id" class="nav-entry">
        <button
          class="nav-item"
          :class="{ active: isNavigationItemActive(item, route.path) }"
          :aria-current="isNavigationItemActive(item, route.path) ? 'page' : undefined"
          :aria-expanded="item.children ? isToolsExpanded : undefined"
          :aria-controls="item.children ? 'tools-subnavigation' : undefined"
          :aria-label="item.label"
          :title="item.label"
          type="button"
          @click="item.children ? toggleTools() : navigateTo(item.route)"
        >
          <AppIcon :name="item.id" />
          <span class="nav-label">{{ item.label }}</span>
        </button>

        <div v-if="item.children && isToolsExpanded" id="tools-subnavigation" class="tool-subnav" aria-label="工具子导航">
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
.app-sidebar { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 0; background: var(--bg-surface); border-right: 1px solid var(--border-subtle); }
.sidebar-brand, .nav-item, .tool-subnav-item { font: inherit; border: 0; cursor: pointer; }
.sidebar-brand { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 0 18px; background: transparent; color: var(--text-primary); text-align: left; }
.brand-mark { display: grid; width: 26px; height: 26px; flex: none; place-items: center; border-radius: 7px; background: var(--brand-primary); color: var(--brand-on-primary); font-size: 12px; font-weight: 750; }
.brand-name { overflow: hidden; font-size: 12px; font-weight: 700; letter-spacing: .02em; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-nav { display: grid; gap: 4px; padding: 12px 10px; border-top: 1px solid var(--border-subtle); }
.nav-entry { position: relative; }
.nav-item { display: flex; align-items: center; width: 100%; gap: 11px; min-height: 40px; padding: 0 10px; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); text-align: left; }
.nav-item:hover { background: var(--surface-secondary); color: var(--text-primary); }
.nav-item.active { background: var(--brand-soft); color: var(--brand-primary); font-weight: 650; }
.nav-item :deep(svg) { flex: none; }
.tool-subnav { display: grid; gap: 2px; margin: 3px 0 2px 21px; padding-left: 10px; border-left: 1px solid var(--border-subtle); }
.tool-subnav-item { min-height: 30px; padding: 0 8px; border-radius: 6px; background: transparent; color: var(--text-secondary); font-size: 11px; text-align: left; }
.tool-subnav-item:hover { background: var(--surface-secondary); color: var(--text-primary); }
.tool-subnav-item.active { color: var(--brand-primary); font-weight: 650; }
.sidebar-footer { display: grid; gap: 7px; margin-top: auto; padding: 13px 18px; border-top: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 10px; }
.local-status { display: flex; align-items: center; gap: 6px; }
.local-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-success); }
.sidebar-version { padding-left: 13px; }
@media (max-width: 1200px) {
  .sidebar-brand, .nav-item { justify-content: center; padding-inline: 0; }
  .brand-name, .nav-label, .local-status-label, .sidebar-version { display: none; }
  .sidebar-footer { justify-items: center; padding-inline: 0; }
  .tool-subnav { position: absolute; top: 0; left: calc(100% + 8px); width: 164px; margin: 0; padding: 6px; border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--bg-surface); box-shadow: var(--surface-shadow); }
  .tool-subnav-item { padding: 0 10px; }
}
</style>

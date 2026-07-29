<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { APP_NAVIGATION, isNavigationItemActive } from '@/features/navigation/app-navigation'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <aside class="app-sidebar" aria-label="主导航">
    <button class="sidebar-brand" type="button" aria-label="Baka TOOLS 首页" title="Baka TOOLS 首页" @click="navigateTo('/')">
      <span class="brand-mark">B</span>
      <span class="brand-name">Baka TOOLS</span>
    </button>

    <nav class="sidebar-nav" aria-label="应用页面">
      <button
        v-for="item in APP_NAVIGATION"
        :key="item.id"
        class="nav-item"
        :class="{ active: isNavigationItemActive(item, route.path) }"
        :aria-current="isNavigationItemActive(item, route.path) ? 'page' : undefined"
        :aria-label="item.label"
        :title="item.label"
        type="button"
        @click="navigateTo(item.route)"
      >
        <AppIcon :name="item.id" />
        <span class="nav-label">{{ item.label }}</span>
      </button>
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
.app-sidebar { display: flex; flex-direction: column; min-height: 0; background: var(--bg-surface); border-right: 1px solid var(--border-subtle); }
.sidebar-brand, .nav-item { font: inherit; border: 0; cursor: pointer; }
.sidebar-brand { display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 0 18px; background: transparent; color: var(--text-primary); text-align: left; }
.brand-mark { display: grid; width: 26px; height: 26px; flex: none; place-items: center; border-radius: 7px; background: var(--brand-primary); color: var(--brand-on-primary); font-size: 12px; font-weight: 750; }
.brand-name { overflow: hidden; font-size: 12px; font-weight: 700; letter-spacing: .02em; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-nav { display: grid; gap: 4px; padding: 12px 10px; border-top: 1px solid var(--border-subtle); }
.nav-item { display: flex; align-items: center; gap: 11px; min-height: 40px; padding: 0 10px; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); text-align: left; }
.nav-item:hover { background: var(--surface-secondary); color: var(--text-primary); }
.nav-item.active { background: var(--brand-soft); color: var(--brand-primary); font-weight: 650; }
.nav-item :deep(svg) { flex: none; }
.sidebar-footer { display: grid; gap: 7px; margin-top: auto; padding: 13px 18px; border-top: 1px solid var(--border-subtle); color: var(--text-tertiary); font-size: 10px; }
.local-status { display: flex; align-items: center; gap: 6px; }
.local-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-success); }
.sidebar-version { padding-left: 13px; }
@media (max-width: 1200px) { .sidebar-brand, .nav-item { justify-content: center; padding-inline: 0; } .brand-name, .nav-label, .local-status-label, .sidebar-version { display: none; } .sidebar-footer { justify-items: center; padding-inline: 0; } }
</style>

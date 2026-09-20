<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { useToolPosters } from '@/composables/useToolPosters'
import { APP_NAVIGATION, APP_UTILITY_NAVIGATION, isNavigationItemActive } from '@/features/navigation/app-navigation'
import { getRememberedWorkspace, loadLastWorkspace } from '@/features/navigation/workspace-history'
import { findToolByRoute } from '@/features/tools/tool-catalog'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const { posterOf } = useToolPosters()

/** 正在使用的工具；不在工具页时退回上次工作区对应的工具，方便一键回去。 */
const currentTool = computed(() => findToolByRoute(route.path))
const avatarTool = computed(() => {
  if (currentTool.value) return currentTool.value
  const remembered = getRememberedWorkspace(loadLastWorkspace())
  return remembered ? findToolByRoute(remembered.route) : null
})
const avatarLabel = computed(() => {
  if (!avatarTool.value) return ''
  return currentTool.value ? `当前工具：${avatarTool.value.label}` : `回到${avatarTool.value.label}`
})

function navigateTo(path: string) {
  void router.push(path)
}

function onAvatarClick() {
  if (!avatarTool.value) return
  if (currentTool.value) appStore.openToolPicker()
  else navigateTo(avatarTool.value.route)
}
</script>

<template>
  <aside class="app-sidebar" aria-label="主导航">
    <nav class="rail" aria-label="应用页面">
      <span class="rail__logo" aria-hidden="true"><i></i></span>

      <button
        v-for="item in APP_NAVIGATION"
        :key="item.id"
        class="nav-item"
        :class="{ active: isNavigationItemActive(item, route.path) }"
        :aria-current="isNavigationItemActive(item, route.path) ? 'page' : undefined"
        :aria-label="item.label"
        type="button"
        @click="navigateTo(item.route)"
      >
        <AppIcon :name="item.id" />
      </button>

      <button
        v-if="avatarTool"
        class="nav-current"
        :class="{ active: Boolean(currentTool) }"
        type="button"
        :aria-label="avatarLabel"
        @click="onAvatarClick"
      >
        <img :src="posterOf(avatarTool.key)" alt="" :style="{ objectPosition: avatarTool.posterPosition }" />
      </button>

      <button
        class="tool-picker-toggle"
        :class="{ active: appStore.toolPickerOpen }"
        type="button"
        aria-label="工具选择"
        :aria-expanded="appStore.toolPickerOpen"
        @click="appStore.toggleToolPicker()"
      >
        <AppIcon name="tools" />
      </button>

      <span class="rail__gap" aria-hidden="true"></span>

      <button
        v-for="item in APP_UTILITY_NAVIGATION"
        :key="item.id"
        class="nav-item nav-item--utility"
        :class="{ active: isNavigationItemActive(item, route.path) }"
        :aria-current="isNavigationItemActive(item, route.path) ? 'page' : undefined"
        :aria-label="item.label"
        type="button"
        @click="navigateTo(item.route)"
      >
        <AppIcon :name="item.id" />
      </button>
    </nav>
  </aside>
</template>

<style scoped>
.app-sidebar { position: absolute; z-index: 5; left: 16px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; }
.rail { pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; width: 60px; padding: 12px 0; border-radius: var(--radius-pill); background: var(--chrome-bg); backdrop-filter: blur(14px); box-shadow: var(--surface-shadow-lg); }
.rail__logo { width: 34px; height: 34px; border-radius: 13px; background: var(--brand-gradient); display: grid; place-items: center; box-shadow: 0 8px 20px rgba(var(--brand-primary-rgb), 0.35); transform: rotate(-8deg); margin-bottom: 6px; }
.rail__logo i { width: 11px; height: 11px; border: 2.4px solid #fff; border-radius: 3px; transform: rotate(45deg); }
.rail__gap { height: 26px; }
.nav-item, .tool-picker-toggle, .nav-current { position: relative; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--ink-tertiary); font: inherit; cursor: pointer; transition: background-color 160ms ease, color 160ms ease, transform 180ms var(--ease-bounce); }
.nav-item :deep(svg), .tool-picker-toggle :deep(svg) { width: 21px; height: 21px; }
.nav-item.active { background: var(--brand-soft); color: var(--brand-hover); }
.nav-item.active::after { content: ""; position: absolute; right: 5px; top: 7px; width: 8px; height: 8px; border-radius: 50%; background: var(--brand-primary); box-shadow: 0 0 0 3px var(--surface-primary); }
.nav-current { width: 42px; height: 42px; overflow: hidden; box-shadow: 0 0 0 3px var(--surface-primary), 0 0 0 5px var(--brand-soft); }
.nav-current img { width: 100%; height: 100%; object-fit: cover; }
.nav-current.active { box-shadow: 0 0 0 3px var(--surface-primary), 0 0 0 6px var(--brand-primary); }
.tool-picker-toggle { width: 48px; height: 48px; margin: 4px 0; background: var(--brand-gradient); color: #fff; box-shadow: 0 12px 26px rgba(var(--brand-primary-rgb), 0.42); }
.tool-picker-toggle::before { content: ""; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid rgba(var(--brand-primary-rgb), 0.3); transition: transform 180ms var(--ease-bounce), opacity 180ms ease; }
.tool-picker-toggle.active { transform: rotate(-12deg) scale(1.04); }

/* tooltips */
.nav-item::before, .tool-picker-toggle::after, .nav-current::before {
  content: attr(aria-label); position: absolute; left: calc(100% + 14px); top: 50%; transform: translateY(-50%) translateX(-4px);
  padding: 6px 11px; border-radius: 9px; background: var(--ink-primary); color: var(--surface-primary); font-size: 11.5px; font-weight: 700; white-space: nowrap;
  box-shadow: var(--ink-shadow); opacity: 0; pointer-events: none; transition: opacity 140ms ease, transform 140ms ease; z-index: 60;
}
.nav-item:hover::before, .tool-picker-toggle:hover::after, .nav-current:hover::before { opacity: 1; transform: translateY(-50%) translateX(0); }

@media (hover: hover) and (pointer: fine) {
  .nav-item:hover { background: var(--brand-tint); color: var(--brand-hover); transform: translateX(2px) scale(1.04); }
  .nav-current:hover { transform: scale(1.06); }
  .tool-picker-toggle:hover { transform: translateY(-2px) scale(1.05); }
  .tool-picker-toggle:hover::before { transform: scale(1.1); opacity: .6; }
}
.nav-item:active, .tool-picker-toggle:active, .nav-current:active { transform: scale(0.95); }
.nav-item:focus-visible, .tool-picker-toggle:focus-visible, .nav-current:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .nav-item, .tool-picker-toggle, .nav-current, .tool-picker-toggle::before { transition: none !important; transform: none !important; }
}
</style>

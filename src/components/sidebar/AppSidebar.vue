<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { APP_NAVIGATION, isNavigationItemActive } from '@/features/navigation/app-navigation'
import { useAppStore } from '@/stores/app'
import { useWorkbenchStore } from '@/stores/workbench'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const wbStore = useWorkbenchStore()

const isWorkbench = computed(() => route.path === '/workbench')

const activeNavigationIndex = computed(() => {
  const index = APP_NAVIGATION.findIndex((item) => isNavigationItemActive(item, route.path))
  return index >= 0 ? index : 0
})
const activeRailStyle = computed(() => ({
  '--active-navigation-index': String(activeNavigationIndex.value),
}))

function navigateTo(path: string) {
  router.push(path)
}
</script>

<template>
  <aside class="app-sidebar" aria-label="主导航">
    <nav class="sidebar-nav" :style="activeRailStyle" aria-label="应用页面">
      <span class="sidebar-active-rail" aria-hidden="true"></span>
      <div v-for="item in APP_NAVIGATION" :key="item.id" class="nav-entry">
        <button
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
      </div>
    </nav>

    <div v-if="isWorkbench" class="sidebar-workbench">
      <span class="sidebar-workbench__label">工作台</span>
      <template v-if="!wbStore.activeNode">
        <button class="sidebar-workbench__btn" type="button" aria-label="项目" @click="wbStore.toggleRail('projects')">▤</button>
        <button class="sidebar-workbench__btn" type="button" aria-label="结果" @click="wbStore.toggleRail('assets')">◫</button>
        <button class="sidebar-workbench__btn" type="button" aria-label="设置" @click="wbStore.toggleRail('settings')">…</button>
      </template>
      <template v-else>
        <button class="sidebar-workbench__btn" type="button" aria-label="运行此节点" @click="wbStore.issueAction('run-node')">▶</button>
        <button class="sidebar-workbench__btn" type="button" aria-label="复制" @click="wbStore.issueAction('copy')">⧉</button>
        <button class="sidebar-workbench__btn" type="button" aria-label="粘贴" @click="wbStore.issueAction('paste')">📋</button>
        <button class="sidebar-workbench__btn" type="button" aria-label="删除" @click="wbStore.issueAction('delete-selected')">✕</button>
        <button class="sidebar-workbench__btn" type="button" aria-label="保存内容" @click="wbStore.issueAction('save-node-content')">💾</button>
        <button
          v-if="wbStore.activeNode.genOpen !== undefined"
          class="sidebar-workbench__btn"
          type="button"
          :aria-label="wbStore.activeNode.genOpen ? '收起生成器' : '展开生成器'"
          @click="wbStore.issueAction('toggle-gen')"
        >
          ⇅
        </button>
      </template>
    </div>

    <div class="sidebar-footer">
      <button
        class="tool-picker-toggle"
        :class="{ active: appStore.toolPickerOpen }"
        type="button"
        aria-label="工具选择"
        :aria-expanded="appStore.toolPickerOpen"
        @click="appStore.toggleToolPicker()"
      >
        <AppIcon name="tools" />
        <span class="nav-label">工具选择</span>
      </button>
      <span class="sidebar-version">v{{ appStore.version }}</span>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 0; border: 0; background: color-mix(in srgb, var(--app-bg) 88%, var(--brand-soft)); }
.nav-item { font: inherit; border: 0; cursor: pointer; }
.sidebar-nav { position: relative; display: grid; gap: 4px; padding: 16px 10px 12px; border: 0; }
.sidebar-active-rail { position: absolute; z-index: 2; top: 16px; left: 5px; width: 3px; height: 40px; border-radius: 999px; background: var(--brand-primary); box-shadow: 0 0 10px color-mix(in srgb, var(--brand-primary) 72%, transparent); transform: translateY(calc(var(--active-navigation-index) * 44px)); transition: transform 240ms cubic-bezier(.2, .8, .2, 1); pointer-events: none; }
.nav-entry { position: relative; z-index: 1; }
.nav-item { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; width: 100%; height: 40px; min-height: 0; gap: 0; padding: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); text-align: left; transition: color 160ms ease, background-color 160ms ease, transform 160ms cubic-bezier(.2, .8, .2, 1); }
.nav-item.active { background: var(--brand-soft); color: var(--brand-primary); font-weight: 650; }
.nav-item :deep(svg) { flex: none; transition: transform 160ms cubic-bezier(.2, .8, .2, 1); }
.nav-label { display: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: transform 160ms cubic-bezier(.2, .8, .2, 1); }
.sidebar-footer { display: grid; justify-items: center; gap: 10px; margin-top: auto; padding: 12px 0; border: 0; color: var(--text-secondary); font-size: 10px; }
.tool-picker-toggle { position: relative; display: flex; align-items: center; justify-content: center; gap: 0; width: 100%; height: 38px; padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary); font: inherit; cursor: pointer; transition: background-color 160ms ease, color 160ms ease; }
.tool-picker-toggle:hover, .tool-picker-toggle.active { background: var(--brand-soft); color: var(--brand-primary); }
.tool-picker-toggle :deep(svg) { flex: none; }
.tool-picker-toggle .nav-label { display: none; }
.sidebar-version { display: none; padding-left: 10px; }

.sidebar-workbench {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  padding: 10px 10px 12px;
  box-shadow: inset 0 1px 0 var(--line-subtle);
  animation: sidebar-workbench-in 0.2s ease-out;
}
.sidebar-workbench__label {
  padding-left: 4px;
  color: var(--text-tertiary);
  font-size: 9.5px;
  letter-spacing: 0.12em;
}
.sidebar-workbench__btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 38px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms cubic-bezier(.2, .8, .2, 1);
}
.sidebar-workbench__btn:hover {
  background: var(--surface-secondary);
  color: var(--brand-primary);
  transform: translateX(2px) scale(1.018);
}
.sidebar-workbench__btn:active { transform: scale(.97); }
.sidebar-workbench__btn::after {
  content: attr(aria-label);
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  padding: 6px 11px;
  border: 0;
  border-radius: 7px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: var(--surface-shadow);
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease, transform 150ms ease;
  z-index: 60;
}
.sidebar-workbench__btn:hover::after {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}
@keyframes sidebar-workbench-in {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

/* icon-mode tooltips */
.nav-item::after,
.tool-picker-toggle::after {
  content: attr(aria-label);
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  padding: 6px 11px;
  border: 0;
  border-radius: 7px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: var(--surface-shadow);
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease, transform 150ms ease;
  z-index: 60;
}
.nav-item:hover::after,
.tool-picker-toggle:hover::after,
.tool-picker-toggle.active::after {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
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
@media (prefers-reduced-motion: reduce) {
  .sidebar-active-rail { transition: none; }
  .sidebar-workbench { animation: none !important; }
  .sidebar-workbench__btn { transition: none !important; transform: none !important; }
  .nav-item,
  .nav-item :deep(svg),
  .nav-label { animation: none !important; transition: none !important; transform: none !important; }
}
</style>

<script setup lang="ts">
import type { SettingsSection, SettingsSectionId, SettingsIconName } from './settings-ia'

defineProps<{
  sections: SettingsSection[]
  title?: string
}>()

const activeId = defineModel<SettingsSectionId>({ required: true })

const paths: Record<SettingsIconName, string> = {
  sliders: 'M4 7h8M12 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0M16 7h4M4 17h4M8 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0M12 17h8',
  palette: 'M12 4.5a7.5 7.5 0 1 0 0 15h1.5a1.8 1.8 0 0 0 0-3.6H12a1.2 1.2 0 1 1 0-2.4h3.4A7.5 7.5 0 0 0 12 4.5Z M8 9.2h.01M10.2 7.2h.01M14 7.4h.01',
  box: 'M4.8 8.2 12 4.6l7.2 3.6v7.2L12 19.4 4.8 15.8V8.2Z M12 19.4V12 M4.8 8.2 12 12l7.2-3.8',
  key: 'M14.8 8.2a3.4 3.4 0 1 0-3.1 4.8H21v2.2h-2.2v2.2H16v-4.4h-4.3A3.4 3.4 0 0 0 14.8 8.2Z',
  wifi: 'M4.6 9.4a10.4 10.4 0 0 1 14.8 0M7.4 12.4a6.4 6.4 0 0 1 9.2 0M12 16.8h.01',
  drive: 'M5 8.2h14l1.6 4.2v5.2a1.4 1.4 0 0 1-1.4 1.4H4.8A1.4 1.4 0 0 1 3.4 17.6v-5.2L5 8.2Z M3.8 12.4h16.4 M7 15.4h.01M10 15.4h.01',
  puzzle: 'M9 5.4h4.2v2.2a1.6 1.6 0 1 0 0 0.2V9.8h2.2a1.6 1.6 0 1 1 0 3.2H13.2v2.2a1.6 1.6 0 1 1-3.2 0v-2.2H7.8V9.8h1.2A1.6 1.6 0 1 0 9 5.4Z',
  info: 'M12 12.4v4 M12 8.2h.01 M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8Z',
}
</script>

<template>
  <div class="settings-layout">
    <aside class="settings-layout__nav" role="tablist">
      <div class="settings-layout__nav-title">{{ title || '设置' }}</div>
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        role="tab"
        class="settings-layout__item"
        :class="{ active: activeId === section.id }"
        :aria-selected="activeId === section.id"
        @click="activeId = section.id"
      >
        <svg class="settings-layout__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path :d="paths[section.icon]" />
        </svg>
        <span class="settings-layout__label">{{ section.label }}</span>
      </button>
    </aside>

    <div class="settings-layout__pane">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-layout {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--settings-sidebar-width) minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  background: var(--app-bg);
}
.settings-layout__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 10px;
  border-right: 1px solid var(--settings-card-border);
  background: var(--settings-sidebar-bg);
  overflow-y: auto;
}
.settings-layout__nav-title {
  padding: 2px 10px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--settings-muted);
}
.settings-layout__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 550;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.settings-layout__item:hover {
  background: var(--settings-nav-hover);
  color: var(--text-primary);
}
.settings-layout__item.active {
  background: var(--settings-accent-soft);
  color: var(--settings-accent);
}
.settings-layout__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.settings-layout__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-layout__pane {
  min-height: 0;
  overflow-y: auto;
  padding: 18px 22px 28px;
}
@media (max-width: 820px) {
  .settings-layout { grid-template-columns: 1fr; overflow: auto; }
  .settings-layout__nav { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--settings-card-border); }
  .settings-layout__nav-title { display: none; }
  .settings-layout__item { flex-shrink: 0; }
}
</style>

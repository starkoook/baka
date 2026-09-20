<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  align?: 'center' | 'start'
}>()
</script>

<template>
  <div class="settings-row" :class="`settings-row--${align ?? 'center'}`">
    <div class="settings-row__info">
      <div class="settings-row__title">{{ title }}</div>
      <div v-if="description" class="settings-row__desc">{{ description }}</div>
    </div>
    <div class="settings-row__control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.settings-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  min-height: var(--settings-row-height);
  padding: var(--settings-row-pad-y) var(--settings-row-pad-x);
  border-bottom: 1px solid var(--settings-divider);
}
.settings-row:last-child { border-bottom: 0; }
.settings-row--center { align-items: center; }
.settings-row--start { align-items: flex-start; padding-top: 12px; padding-bottom: 12px; }
.settings-row__info { min-width: 0; flex: 1; }
.settings-row__title {
  font-size: 13px;
  font-weight: 550;
  color: var(--text-primary);
  line-height: 1.3;
}
.settings-row__desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--settings-muted);
}
.settings-row__control {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}
</style>

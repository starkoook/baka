<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <section class="settings-card">
    <header v-if="title" class="settings-card__header">
      <div class="settings-card__title">{{ title }}</div>
      <div v-if="description" class="settings-card__desc">{{ description }}</div>
    </header>
    <div class="settings-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-card {
  border: 1px solid var(--settings-card-border);
  border-radius: var(--settings-card-radius);
  background: var(--settings-card-bg);
  overflow: hidden;
}
.settings-card__header {
  padding: 12px var(--settings-row-pad-x);
  border-bottom: 1px solid var(--settings-divider);
}
.settings-card__title {
  font-size: 13px;
  font-weight: 650;
  color: var(--text-primary);
  line-height: 1.3;
}
.settings-card__desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--settings-muted);
}
.settings-card__body {
  padding: 0;
}
</style>

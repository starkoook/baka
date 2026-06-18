<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  icon?: string
  collapsible?: boolean
  defaultOpen?: boolean
}>(), {
  collapsible: true,
  defaultOpen: true,
})

const isOpen = ref(props.defaultOpen)

function toggle() {
  if (props.collapsible) isOpen.value = !isOpen.value
}
</script>

<template>
  <div class="fp-card" :class="{ collapsed: !isOpen }">
    <div class="fp-head" @click="toggle">
      <div class="fp-head-left">
        <span v-if="icon" class="fp-icon">{{ icon }}</span>
        <span class="fp-title">{{ title }}</span>
      </div>
      <span v-if="collapsible" class="fp-arrow" :class="{ open: isOpen }">▾</span>
    </div>
    <div v-show="isOpen" class="fp-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.fp-card {
  background: rgba(24, 24, 26, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}
.fp-card:hover { border-color: rgba(255, 255, 255, 0.08); }
.fp-card.collapsed { opacity: 0.7; }
.fp-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 14px; cursor: pointer; user-select: none;
  transition: background 0.15s;
}
.fp-head:hover { background: rgba(255, 255, 255, 0.02); }
.fp-head-left { display: flex; align-items: center; gap: 8px; }
.fp-icon { font-size: 14px; }
.fp-title { font-size: 12px; font-weight: 600; color: #d1d5db; }
.fp-arrow { font-size: 10px; color: #6b7280; transition: transform 0.2s; }
.fp-arrow.open { transform: rotate(180deg); }
.fp-body { padding: 0 14px 14px; }
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'

export interface ContextMenuItem {
  label: string
  danger?: boolean
  group?: string
  action: () => void
}

const props = defineProps<{
  x: number
  y: number
  items: ContextMenuItem[]
  searchable?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const search = ref('')
const filtered = computed(() => {
  if (!props.searchable) return props.items
  const q = search.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) || (item.group || '').toLowerCase().includes(q),
  )
})
</script>

<template>
  <Teleport to="body">
    <div class="ctx-backdrop" @click="emit('close')" @contextmenu.prevent="emit('close')"></div>
    <div class="ctx-menu" :style="{ left: `${x}px`, top: `${y}px` }">
      <input
        v-if="searchable"
        v-model="search"
        class="ctx-menu__search"
        placeholder="搜索节点…"
        @pointerdown.stop
      />
      <template v-for="(item, index) in filtered" :key="index">
        <span
          v-if="item.group && (index === 0 || filtered[index - 1].group !== item.group)"
          class="ctx-menu__group"
        >
          {{ item.group }}
        </span>
        <button
          class="ctx-menu__item"
          :class="{ 'ctx-menu__item--danger': item.danger }"
          type="button"
          @click="item.action(); emit('close')"
        >
          {{ item.label }}
        </button>
      </template>
      <p v-if="searchable && !filtered.length" class="ctx-menu__empty">没有匹配的节点</p>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
}
.ctx-menu {
  position: fixed;
  z-index: 901;
  min-width: 172px;
  padding: 5px;
  border: 1px solid var(--line-subtle);
  border-radius: 10px;
  background: var(--surface-primary);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
}
.ctx-menu__item {
  display: block;
  width: 100%;
  height: 33px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.ctx-menu__item:hover { background: var(--brand-soft); color: var(--brand-primary); }
.ctx-menu__item--danger { color: #ff8a78; }
.ctx-menu__item--danger:hover { background: rgba(255, 137, 117, 0.1); color: #ff9a86; }
.ctx-menu__search {
  display: block;
  width: 100%;
  height: 30px;
  margin-bottom: 4px;
  padding: 0 10px;
  border: 1px solid var(--line-subtle);
  border-radius: 7px;
  outline: none;
  background: var(--surface-secondary);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}
.ctx-menu__group {
  display: block;
  padding: 7px 12px 3px;
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  user-select: none;
}
.ctx-menu__empty {
  margin: 0;
  padding: 10px 12px;
  color: var(--text-tertiary);
  font-size: 11px;
  text-align: center;
}
</style>

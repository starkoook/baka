<script setup lang="ts">
import { useToolPosters } from '@/composables/useToolPosters'
import type { RememberedWorkspace } from '@/features/navigation/workspace-history'
import { findToolByRoute } from '@/features/tools/tool-catalog'

defineProps<{
  items: RememberedWorkspace[]
}>()

const emit = defineEmits<{ navigate: [route: string] }>()
const { posterOf } = useToolPosters()
</script>

<template>
  <section class="ws" aria-labelledby="ws-title">
    <header>
      <h2 id="ws-title">最近工作区</h2>
    </header>
    <p v-if="items.length === 0" class="ws__empty">还没去过别的地方。打开一个工具，这里会记住你上次停在哪。</p>
    <div v-else class="ws__list">
      <button
        v-for="(item, index) in items"
        :key="item.route"
        class="ws__item"
        :class="`ws__item--${index}`"
        type="button"
        @click="emit('navigate', item.route)"
      >
        <img v-if="findToolByRoute(item.route)" :src="posterOf(findToolByRoute(item.route)!.key)" alt="" />
        <span v-else class="ws__dot" aria-hidden="true"></span>
        <span class="ws__text">
          <b>{{ item.shortLabel }}</b>
          <i>{{ item.label }}</i>
        </span>
        <em aria-hidden="true">→</em>
      </button>
    </div>
  </section>
</template>

<style scoped>
.ws header { display: flex; align-items: center; justify-content: space-between; }
.ws h2 { font-size: 15px; font-weight: 900; }
.ws__empty { margin-top: 12px; font-size: 12px; line-height: 1.6; color: var(--ink-tertiary); }
.ws__list { display: grid; gap: 10px; margin-top: 14px; }
.ws__item {
  display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 14px 0 10px; border: 0; border-radius: 999px;
  background: var(--surface-primary); box-shadow: var(--surface-shadow); color: inherit; font: inherit; text-align: left; cursor: pointer;
  transition: transform 0.25s var(--ease-bounce), box-shadow 0.25s ease;
}
.ws__item--1 { transform: translateX(10px); }
.ws__item--2 { transform: translateX(-6px); }
.ws__item:hover { transform: translateX(4px) scale(1.02); box-shadow: var(--surface-shadow-lg); }
.ws__item img, .ws__dot { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; flex: none; background: var(--brand-soft); }
.ws__text { min-width: 0; flex: 1; }
.ws__text b { display: block; font-size: 12.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ws__text i { display: block; font-style: normal; font-size: 10.5px; color: var(--ink-tertiary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ws__item em { font-style: normal; color: var(--brand-primary); font-weight: 900; }
@media (prefers-reduced-motion: reduce) { .ws__item { transition: none; } }
</style>

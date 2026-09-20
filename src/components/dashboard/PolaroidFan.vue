<script setup lang="ts">
export interface PolaroidItem {
  id: number
  src: string
  caption: string
  isNew?: boolean
}

defineProps<{
  items: PolaroidItem[]
}>()

const emit = defineEmits<{ open: [item: PolaroidItem] }>()

/** 六张的扇形角度；少于六张时取前几个 */
const ROTATIONS = [-9, -5, -1, 3, 6, 10]
</script>

<template>
  <div class="fan" :class="{ 'fan--empty': items.length === 0 }">
    <p v-if="items.length === 0" class="fan__empty">
      <i class="fan__blob" aria-hidden="true"></i>
      <b>还没有图片</b>
      <span>去图库导入第一批素材，这里会摆成一叠拍立得。</span>
    </p>
    <button
      v-for="(item, index) in items.slice(0, 6)"
      :key="item.id"
      class="pol"
      :class="{ 'pol--new': item.isNew }"
      type="button"
      :style="{ '--rot': `${ROTATIONS[index] ?? 0}deg`, '--x': `${index * 88}px`, zIndex: index + 1 }"
      :title="item.caption"
      @click="emit('open', item)"
    >
      <img v-if="item.src" :src="item.src" alt="" />
      <span v-else class="pol__skeleton" aria-hidden="true"></span>
      <figcaption>{{ item.caption }}</figcaption>
    </button>
  </div>
</template>

<style scoped>
.fan { position: relative; height: 320px; }
.fan--empty { display: grid; place-items: center; }
.fan__empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; color: var(--ink-tertiary); font-size: 12px; }
.fan__empty b { color: var(--ink-primary); font-size: 14px; font-weight: 800; }
.fan__blob { width: 64px; height: 64px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #fff 0 20%, var(--brand-soft) 21%); position: relative; margin-bottom: 12px; }
.fan__blob::after { content: ""; position: absolute; right: -6px; bottom: 2px; width: 22px; height: 22px; border-radius: 50%; background: var(--accent-lavender-soft); }
.pol {
  position: absolute; left: var(--x); bottom: 16px; width: 150px; padding: 8px 8px 30px; border: 0;
  background: var(--surface-primary); border-radius: 16px; box-shadow: var(--ink-shadow);
  transform: rotate(var(--rot)); transform-origin: 50% 100%; cursor: pointer; text-align: center; font: inherit; color: inherit;
  transition: transform 0.3s var(--ease-bounce), box-shadow 0.3s ease;
}
.pol img, .pol__skeleton { display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 10px; background: var(--surface-tertiary); }
.pol figcaption { position: absolute; left: 6px; right: 6px; bottom: 8px; font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pol--new::before {
  content: "新"; position: absolute; left: -8px; top: -8px; z-index: 2; width: 30px; height: 30px; border-radius: 50%;
  background: var(--brand-primary); color: #fff; font-size: 11.5px; font-weight: 900; display: grid; place-items: center;
  box-shadow: 0 6px 14px rgba(var(--brand-primary-rgb), 0.4); transform: rotate(-12deg);
}
@media (hover: hover) and (pointer: fine) {
  .pol:hover { transform: rotate(0deg) translateY(-14px) scale(1.04); z-index: 20 !important; box-shadow: var(--surface-shadow-lg); }
}
.pol:focus-visible { outline: 3px solid var(--brand-primary); outline-offset: 2px; z-index: 20 !important; }
@media (prefers-reduced-motion: reduce) { .pol { transition: none; } .pol:hover { transform: rotate(var(--rot)); } }
</style>

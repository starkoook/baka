<script setup lang="ts">
defineProps<{ count: number; hasDatasets: boolean }>()
defineEmits<{ sendToTagger: []; addToDataset: []; copyMove: []; organize: []; editTags: []; batchTools: []; audit: []; delete: []; clear: [] }>()
</script>

<template>
  <div class="selection-bar" :class="{ 'selection-bar--single': count === 1 }">
    <div class="selection-count"><span>已选</span><strong>{{ count }}</strong><span>张</span></div>
    <div class="selection-divider"></div>
    <button class="primary" @click="$emit('sendToTagger')">送去标注</button>
    <button @click="$emit('addToDataset')">{{ hasDatasets ? '加入数据集' : '新建数据集' }}</button>
    <template v-if="count > 1">
      <button @click="$emit('copyMove')">复制或移动</button>
      <button @click="$emit('organize')">按标签归集</button>
      <button @click="$emit('editTags')">批量改标签</button>
      <button @click="$emit('batchTools')">批量工具</button>
      <button @click="$emit('audit')">角色审计</button>
    </template>
    <button class="danger" @click="$emit('delete')">回收站</button>
    <button class="clear" aria-label="取消选择" @click="$emit('clear')">取消选择</button>
  </div>
</template>

<style scoped>
.selection-bar { position: absolute; z-index: 12; left: 50%; bottom: 16px; transform: translateX(-50%) rotate(-1deg); min-width: 0; height: 56px; display: flex; align-items: center; gap: 7px; padding: 8px 9px 8px 18px; border: 0; border-radius: var(--radius-pill); background: var(--ink-primary); color: var(--surface-primary); box-shadow: 0 20px 44px rgba(74, 45, 61, .35); white-space: nowrap; }
.selection-bar--single { transform: translateX(-50%) rotate(1deg); }
.selection-count { display: flex; align-items: baseline; gap: 5px; }
.selection-count strong { color: var(--brand-primary); font-size: 16px; font-weight: 900; }
.selection-count span { color: rgba(255,255,255,.7); font-size: 11px; }
.selection-divider { width: 1px; height: 22px; background: rgba(255,255,255,.14); margin: 0 4px; }
button { height: 34px; padding: 0 13px; border: 0; border-radius: var(--radius-pill); background: rgba(255,255,255,.1); color: #fff; cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 700; white-space: nowrap; transition: background-color 140ms ease, transform 160ms var(--ease-bounce); }
button:hover { background: rgba(255,255,255,.18); }
button:active { transform: scale(.96); }
button.primary { background: var(--brand-gradient); color: #fff; box-shadow: 0 8px 20px rgba(var(--brand-primary-rgb), .35); }
button.danger { color: #ffb1c1; }
button.clear { background: transparent; color: rgba(255,255,255,.6); }
@media (max-width: 760px) { .selection-bar { left: 10px; right: 10px; transform: none; overflow-x: auto; } }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>

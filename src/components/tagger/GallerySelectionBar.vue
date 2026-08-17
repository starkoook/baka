<script setup lang="ts">
defineProps<{ count: number; hasDatasets: boolean }>()
defineEmits<{ sendToTagger: []; addToDataset: []; copyMove: []; organize: []; editTags: []; audit: []; delete: []; clear: [] }>()
</script>

<template>
  <div class="selection-bar">
    <div class="selection-count"><strong>{{ count }}</strong><span>张已选择</span></div>
    <div class="selection-divider"></div>
    <button class="primary" @click="$emit('sendToTagger')">送去标注</button>
    <button @click="$emit('addToDataset')">{{ hasDatasets ? '加入数据集' : '新建数据集' }}</button>
    <button @click="$emit('copyMove')">复制或移动</button>
    <button @click="$emit('organize')">按标签归集</button>
    <button @click="$emit('editTags')">批量改标签</button>
    <button @click="$emit('audit')">角色审计</button>
    <button class="danger" @click="$emit('delete')">移入回收站</button>
    <button class="clear" @click="$emit('clear')">取消选择</button>
  </div>
</template>

<style scoped>
.selection-bar { position: absolute; z-index: 12; left: 50%; bottom: 18px; transform: translateX(-50%); min-width: 560px; height: 54px; display: flex; align-items: center; gap: 7px; padding: 7px 9px 7px 14px; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(25,22,29,.94); box-shadow: 0 18px 55px rgba(0,0,0,.4); backdrop-filter: blur(18px); }
.selection-count { display: flex; align-items: baseline; gap: 5px; min-width: 74px; }
.selection-count strong { color: var(--accent-primary); font-size: 16px; }.selection-count span { color: var(--text-tertiary); font-size: 9px; }
.selection-divider { width: 1px; height: 22px; background: rgba(255,255,255,.08); }
button { height: 34px; padding: 0 13px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.04); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 10px; white-space: nowrap; }
button.primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
button.danger { border-color: rgba(255,137,117,.35); color: #ff9a86; }
button.clear { border-color: transparent; background: transparent; color: var(--text-tertiary); }
@media (max-width: 760px) { .selection-bar { left: 10px; right: 10px; min-width: 0; transform: none; overflow-x: auto; } }
</style>

<script setup lang="ts">
import { useSequenceStore } from "@/stores/sequence"

const store = useSequenceStore()
const emit = defineEmits<{
  import: []
  slice: []
  exportPng: []
  exportZip: []
  exportGif: []
  exportJson: []
}>()
</script>

<template>
  <div class="seq-toolbar">
    <button type="button" @click="emit('import')">导入帧</button>
    <button type="button" @click="emit('slice')">切图集</button>
    <button type="button" @click="store.loadDemoCycle()">示例走路</button>
    <button type="button" :disabled="!store.count" @click="store.togglePlay()">{{ store.playing ? "暂停" : "播放" }}</button>
    <button type="button" :disabled="!store.count" @click="store.step(-1)">上一帧</button>
    <button type="button" :disabled="!store.count" @click="store.step(1)">下一帧</button>
    <button type="button" :disabled="!store.count" @click="store.clear()">清空</button>
    <span class="seq-toolbar__sep" />
    <button type="button" :disabled="!store.count" @click="emit('exportPng')">导出图集</button>
    <button type="button" :disabled="!store.count" @click="emit('exportZip')">导出 ZIP</button>
    <button type="button" :disabled="!store.count" @click="emit('exportGif')">导出 GIF</button>
    <button type="button" :disabled="!store.count" @click="emit('exportJson')">导出 JSON</button>
  </div>
</template>

<style scoped>
.seq-toolbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.seq-toolbar button {
  height:30px; padding:0 10px; border:1px solid var(--line-subtle, #334); border-radius:8px;
  background:transparent; color:var(--text-secondary, #c8d0dc); cursor:pointer; font:inherit; font-size:12px;
}
.seq-toolbar button:hover { background: var(--brand-soft, #1c2a3a); color: var(--brand-primary, #6ee0c0); }
.seq-toolbar button:disabled { opacity:.4; cursor:not-allowed; }
.seq-toolbar__sep { flex:0 0 12px; }
</style>

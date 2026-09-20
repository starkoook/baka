<script setup lang="ts">
import { useSequenceStore } from "@/stores/sequence"
const store = useSequenceStore()
</script>

<template>
  <aside class="seq-insp">
    <label>FPS <input type="number" min="1" max="60" v-model.number="store.fps" /></label>
    <label class="chk"><input type="checkbox" v-model="store.loop" /> 循环</label>
    <label class="chk"><input type="checkbox" v-model="store.onion" /> 洋葱皮（暂停时）</label>
    <p v-if="store.current">当前：{{ store.current.name }}</p>
    <p>帧数：{{ store.count }}</p>
  </aside>
</template>

<style scoped>
.seq-insp { width:200px; display:flex; flex-direction:column; gap:10px; font-size:12px; color:#c8d0dc; }
.seq-insp input[type=number] { width:72px; margin-left:8px; background:#121826; color:inherit; border:1px solid #2a3648; border-radius:6px; padding:4px 6px; }
.chk { display:flex; align-items:center; gap:8px; }
</style>

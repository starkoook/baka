<script setup lang="ts">
import { ref } from "vue"
import { useSequenceStore } from "@/stores/sequence"

const store = useSequenceStore()
const dragFrom = ref<number | null>(null)

function onDragStart(i: number, e: DragEvent) {
  dragFrom.value = i
  e.dataTransfer?.setData("text/plain", String(i))
}
function onDrop(i: number, e: DragEvent) {
  e.preventDefault()
  const from = dragFrom.value
  dragFrom.value = null
  if (from == null || from === i) return
  store.moveFrame(from, from < i ? i + 1 : i)
}
</script>

<template>
  <div class="seq-tl">
    <div
      v-for="(frame, i) in store.frames"
      :key="frame.id"
      class="seq-tl__item"
      :class="{ on: i === store.index }"
      draggable="true"
      @click="store.select(i)"
      @dragstart="onDragStart(i, $event)"
      @dragover.prevent
      @drop="onDrop(i, $event)"
    >
      <img :src="frame.src" :alt="frame.name" />
      <span>{{ i + 1 }}</span>
      <button type="button" title="删除" @click.stop="store.removeAt(i)">×</button>
    </div>
  </div>
</template>

<style scoped>
.seq-tl { display:flex; gap:8px; overflow-x:auto; padding:8px 2px; min-height:96px; }
.seq-tl__item {
  position:relative; flex:0 0 72px; height:80px; border:1px solid #2a3648; border-radius:8px;
  background:#121826; cursor:pointer; overflow:hidden;
}
.seq-tl__item.on { border-color:#6ee0c0; box-shadow:0 0 0 1px #6ee0c0; }
.seq-tl__item img { width:100%; height:62px; object-fit:contain; image-rendering:pixelated; }
.seq-tl__item span { display:block; text-align:center; font-size:10px; color:#8b97a8; }
.seq-tl__item button {
  position:absolute; top:2px; right:2px; width:18px; height:18px; border:0; border-radius:50%;
  background:#0008; color:#fff; cursor:pointer;
}
</style>

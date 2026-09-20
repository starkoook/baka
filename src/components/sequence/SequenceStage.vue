<script setup lang="ts">
import { computed } from "vue"
import { useSequenceStore } from "@/stores/sequence"

const store = useSequenceStore()
const emit = defineEmits<{ files: [files: File[]] }>()

const prev = computed(() => {
  if (!store.frames.length) return null
  const i = (store.index - 1 + store.frames.length) % store.frames.length
  return store.frames[i]
})
const next = computed(() => {
  if (!store.frames.length) return null
  return store.frames[(store.index + 1) % store.frames.length]
})
const showOnion = computed(() => store.onion && !store.playing && !!store.current)

function onDrop(e: DragEvent) {
  e.preventDefault()
  const list = e.dataTransfer?.files
  if (!list?.length) return
  emit("files", Array.from(list))
}
</script>

<template>
  <div class="seq-stage" @dragover.prevent @drop="onDrop">
    <div v-if="!store.current" class="seq-stage__empty">拖入图片，或用工具栏导入 / 切图集</div>
    <div v-else class="seq-stage__frame">
      <img v-if="showOnion && prev" class="seq-stage__onion seq-stage__onion--prev" :src="prev.src" alt="" />
      <img class="seq-stage__img" :src="store.current.src" :alt="store.current.name" />
      <img v-if="showOnion && next && next.id !== store.current.id" class="seq-stage__onion seq-stage__onion--next" :src="next.src" alt="" />
    </div>
    <div v-if="store.current" class="seq-stage__meta">{{ store.index + 1 }} / {{ store.count }} · {{ store.current.width }}×{{ store.current.height }}</div>
  </div>
</template>

<style scoped>
.seq-stage {
  position:relative; flex:1; min-height:280px; display:flex; align-items:center; justify-content:center;
  background:#0c1018; border:1px solid var(--line-subtle, #243044); border-radius:12px; overflow:hidden;
}
.seq-stage__empty { color:#7b8798; font-size:13px; }
.seq-stage__frame { position:absolute; inset:16px; display:flex; align-items:center; justify-content:center; }
.seq-stage__img, .seq-stage__onion {
  position:absolute; max-width:100%; max-height:100%; width:auto; height:auto;
  object-fit:contain; image-rendering:pixelated;
}
.seq-stage__img { z-index:2; width:100%; height:100%; }
.seq-stage__onion { z-index:1; width:100%; height:100%; }
.seq-stage__onion--prev { opacity:.28; filter:hue-rotate(200deg); }
.seq-stage__onion--next { opacity:.22; filter:hue-rotate(-40deg); }
.seq-stage__meta { position:absolute; right:12px; bottom:10px; font-size:11px; color:#9aa6b8; z-index:3; }
</style>

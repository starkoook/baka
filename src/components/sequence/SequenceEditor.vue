<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import { useSequenceStore } from "@/stores/sequence"
import { exportGif, exportGodot, exportPackedPng, exportZip } from "@/lib/sequence"
import SequenceToolbar from "./SequenceToolbar.vue"
import SequenceStage from "./SequenceStage.vue"
import SequenceTimeline from "./SequenceTimeline.vue"
import SequenceInspector from "./SequenceInspector.vue"
import SliceDialog from "./SliceDialog.vue"

const emit = defineEmits<{ close: [] }>()
const store = useSequenceStore()
const sliceOpen = ref(false)
const fileRef = ref<HTMLInputElement | null>(null)
const err = ref("")
let raf = 0
let acc = 0
let last = 0

function tick(now: number) {
  raf = requestAnimationFrame(tick)
  if (!store.playing || !store.count) { last = now; return }
  if (!last) last = now
  acc += now - last
  last = now
  const interval = 1000 / Math.max(1, store.fps)
  while (acc >= interval) {
    acc -= interval
    const before = store.index
    store.step(1)
    if (!store.loop && store.index === before && store.index === store.count - 1) {
      store.pause()
      acc = 0
      break
    }
    if (!store.playing) { acc = 0; break }
  }
}

function isTypingTarget(el: EventTarget | null) {
  const t = el as HTMLElement | null
  if (!t) return false
  return !!t.closest("input, textarea, [contenteditable=true], select")
}

function onKey(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) return
  if (e.code === "Space") {
    e.preventDefault()
    e.stopPropagation()
    store.togglePlay()
    return
  }
  if (e.key === "ArrowLeft") { e.preventDefault(); store.step(-1) }
  if (e.key === "ArrowRight") { e.preventDefault(); store.step(1) }
  if (e.key === "Escape") emit("close")
}

function openImport() { fileRef.value?.click() }

async function onFiles(files: File[]) {
  err.value = ""
  try { await store.importFiles(files) }
  catch (e) { err.value = (e as Error).message }
}

async function onInput(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ""
  await onFiles(files)
}

async function wrap(fn: () => Promise<unknown>) {
  err.value = ""
  try { await fn() }
  catch (e) { err.value = (e as Error).message || "导出失败" }
}

onMounted(() => {
  raf = requestAnimationFrame(tick)
  window.addEventListener("keydown", onKey, true)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener("keydown", onKey, true)
})
</script>

<template>
  <div class="seq-editor" @pointerdown.stop>
    <header class="seq-editor__head">
      <strong>序列帧</strong>
      <button type="button" class="seq-editor__close" @click="emit('close')">关闭</button>
    </header>
    <SequenceToolbar
      @import="openImport"
      @slice="sliceOpen = true"
      @export-png="wrap(() => exportPackedPng(store.frames))"
      @export-zip="wrap(() => exportZip(store.frames))"
      @export-gif="wrap(() => exportGif(store.frames, store.fps, store.loop))"
      @export-json="wrap(() => exportGodot(store.frames, store.fps, store.loop))"
    />
    <p v-if="err" class="seq-editor__err">{{ err }}</p>
    <div class="seq-editor__body">
      <SequenceStage @files="onFiles" />
      <SequenceInspector />
    </div>
    <SequenceTimeline />
    <SliceDialog :open="sliceOpen" @close="sliceOpen = false" />
    <input ref="fileRef" type="file" accept="image/*" multiple hidden @change="onInput" />
  </div>
</template>

<style scoped>
.seq-editor {
  position:absolute; inset:0; z-index:40; display:flex; flex-direction:column; gap:10px;
  padding:14px 16px; background:#0f141d; color:#d7deea;
}
.seq-editor__head { display:flex; align-items:center; justify-content:space-between; }
.seq-editor__close { height:30px; padding:0 12px; border-radius:8px; border:1px solid #2a3648; background:transparent; color:inherit; cursor:pointer; }
.seq-editor__body { flex:1; display:flex; gap:12px; min-height:0; }
.seq-editor__err { color:#f07178; font-size:12px; margin:0; }
</style>

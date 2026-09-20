<script setup lang="ts">
import { ref } from "vue"
import { useSequenceStore } from "@/stores/sequence"
import { createDemoWalkSheetDataUrl } from "@/lib/demo-frames"
import { probeImageSize, readFileDataUrl } from "@/lib/sequence"

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useSequenceStore()

const src = ref("")
const preview = ref("")
const cols = ref(4)
const rows = ref(2)
const padding = ref(0)
const margin = ref(0)
const busy = ref(false)
const error = ref("")
const fileRef = ref<HTMLInputElement | null>(null)

async function pickSheet() {
  fileRef.value?.click()
}

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ""
  if (!file) return
  src.value = await readFileDataUrl(file)
  preview.value = src.value
  error.value = ""
}

function loadDemo() {
  src.value = createDemoWalkSheetDataUrl()
  preview.value = src.value
  cols.value = 4
  rows.value = 2
  padding.value = 0
  margin.value = 0
  error.value = ""
}

async function apply() {
  if (!src.value) { error.value = "先选择图集或点「示例图集」"; return }
  busy.value = true
  error.value = ""
  try {
    await probeImageSize(src.value)
    await store.sliceAndReplace(src.value, cols.value, rows.value, padding.value, margin.value)
    emit("close")
  } catch (e) {
    error.value = (e as Error).message || "切片失败"
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open" class="seq-dlg" @pointerdown.self="emit('close')">
    <div class="seq-dlg__card" @pointerdown.stop>
      <header>
        <strong>切分图集</strong>
        <button type="button" @click="emit('close')">×</button>
      </header>
      <p>打开后不会弹出系统选文件。点「示例图集」直接切片 4×2 走路，或再选一张图集。</p>
      <div class="seq-dlg__preview">
        <img v-if="preview" :src="preview" alt="sheet" />
        <span v-else>未选择图集</span>
      </div>
      <div class="seq-dlg__grid">
        <label>列 <input type="number" min="1" v-model.number="cols" /></label>
        <label>行 <input type="number" min="1" v-model.number="rows" /></label>
        <label>间距 <input type="number" min="0" v-model.number="padding" /></label>
        <label>边距 <input type="number" min="0" v-model.number="margin" /></label>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <div class="seq-dlg__actions">
        <button type="button" @click="loadDemo">示例图集</button>
        <button type="button" @click="pickSheet">选择图集…</button>
        <button type="button" :disabled="busy" @click="apply">切片并替换时间轴</button>
      </div>
      <input ref="fileRef" type="file" accept="image/*" hidden @change="onFile" />
    </div>
  </div>
</template>

<style scoped>
.seq-dlg { position:absolute; inset:0; background:#0008; display:flex; align-items:center; justify-content:center; z-index:20; }
.seq-dlg__card { width:min(520px, 92%); background:#151b26; border:1px solid #2a3648; border-radius:12px; padding:16px; color:#d5deea; }
header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
header button { border:0; background:transparent; color:inherit; font-size:18px; cursor:pointer; }
.seq-dlg__preview { height:160px; display:flex; align-items:center; justify-content:center; background:#0c1018; border-radius:8px; margin:10px 0; }
.seq-dlg__preview img { max-width:100%; max-height:100%; object-fit:contain; image-rendering:pixelated; }
.seq-dlg__grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.seq-dlg__grid input { width:80px; margin-left:8px; background:#121826; color:inherit; border:1px solid #2a3648; border-radius:6px; padding:4px; }
.seq-dlg__actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.seq-dlg__actions button { height:30px; padding:0 10px; border-radius:8px; border:1px solid #2a3648; background:#1c2533; color:inherit; cursor:pointer; }
.err { color:#f07178; font-size:12px; }
</style>

<script setup lang="ts">
import { ref } from 'vue'; import { useAppStore } from '@/stores/app'; import { playSuccess } from '@/composables/useSound'
const appStore = useAppStore()
const isDragover = ref(false); const imageBase64 = ref<string | null>(null); const imagePreview = ref<string | null>(null); const fileName = ref<string | null>(null); const isProcessing = ref(false)
const threshold = ref(0.25); const cleanTags = ref(true); const engineMode = ref<'api' | 'local'>('api'); const outputFormat = ref<'danbooru' | 'natural' | 'both'>('danbooru')
const tags = ref<string[]>([]); const naturalText = ref(''); const copied = ref(false); const activeTagFilter = ref('')
function onDragOver(e: DragEvent) { e.preventDefault(); isDragover.value = true }
function onDragLeave() { isDragover.value = false }
async function loadFile(file: File) { fileName.value = file.name; const reader = new FileReader(); reader.onload = () => { const d = reader.result as string; imagePreview.value = d; imageBase64.value = d.split(',')[1] || '' }; reader.readAsDataURL(file) }
function onDrop(e: DragEvent) { e.preventDefault(); isDragover.value = false; if (e.dataTransfer?.files.length) loadFile(e.dataTransfer.files[0]) }
function selectFile() { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.onchange = () => { if (input.files?.length) loadFile(input.files[0]) }; input.click() }
function cleanTag(t: string): string { if (!cleanTags.value) return t; return t.replace(/_/g, ' ').replace(/\\/g, '').replace(/['"]/g, '').trim() }
function parseTagList(raw: string): string[] { return raw.split(/[,，\n]+/).map(t => cleanTag(t)).filter(t => t.length > 0 && t.length < 80 && !t.includes('.')) }
async function runReverse() {
  if (!imageBase64.value) return; isProcessing.value = true; tags.value = []; naturalText.value = ''; appStore.setStatus('反推中...')
  try { let tagList: string[] = []
    if (engineMode.value === 'local') { const res = await window.taggerAPI.localInfer({ imagePath: fileName.value!, threshold: threshold.value }); if (res.success && res.tags) tagList = res.tags }
    else { const res = await window.llmAPI.tagImage({ imageBase64: imageBase64.value, threshold: threshold.value, outputFormat: outputFormat.value }); if (res.success && res.tags) tagList = res.tags; if (res.raw) { const extra = parseTagList(res.raw); if (extra.length > tagList.length) tagList = extra } }
    if (outputFormat.value === 'natural' || outputFormat.value === 'both') { naturalText.value = tagList.join(', ') }
    if (outputFormat.value !== 'natural') tags.value = tagList.map(cleanTag)
    appStore.setStatus(`完成: ${tags.value.length} 个标签`); playSuccess()
  } catch (e: any) { appStore.setStatus('反推失败') }
  isProcessing.value = false
}
function copyAll() { navigator.clipboard.writeText(tags.value.join(', ')); copied.value = true; setTimeout(() => copied.value = false, 2000) }
function removeTag(i: number) { tags.value.splice(i, 1) }
function clearAll() { imageBase64.value = null; imagePreview.value = null; fileName.value = null; tags.value = []; naturalText.value = '' }
const displayTags = computed(() => { if (!activeTagFilter.value) return tags.value; return tags.value.filter(t => t.toLowerCase().includes(activeTagFilter.value.toLowerCase())) })
import { computed } from 'vue'
</script>

<template>
  <div class="rv-root">
    <!-- Hero upload area -->
    <div class="rv-hero" :class="{ loaded: imagePreview, hover: isDragover }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @click="!imagePreview && selectFile()">
      <template v-if="imagePreview">
        <img :src="imagePreview" class="rv-hero-img" />
        <div class="rv-hero-overlay">
          <span class="rv-hero-fn">{{ fileName }}</span>
          <button class="rv-hero-change" @click.stop="selectFile">更换图片</button>
        </div>
      </template>
      <template v-else>
        <div class="rv-hero-empty">
          <span class="rv-hero-icon">🖼</span>
          <h1>拖入图片开始反推</h1>
          <p>支持 JPEG / PNG / WebP · 本地 ONNX 或云端 LLM</p>
        </div>
      </template>
    </div>

    <!-- Control strip -->
    <div class="rv-strip">
      <div class="rv-chip-row">
        <button :class="{ on: engineMode === 'api' }" @click="engineMode = 'api'">☁ API</button>
        <button :class="{ on: engineMode === 'local' }" @click="engineMode = 'local'">💻 本地</button>
      </div>
      <div class="rv-chip-row" v-if="engineMode === 'api'">
        <button :class="{ on: outputFormat === 'danbooru' }" @click="outputFormat = 'danbooru'">标签</button>
        <button :class="{ on: outputFormat === 'natural' }" @click="outputFormat = 'natural'">描述</button>
        <button :class="{ on: outputFormat === 'both' }" @click="outputFormat = 'both'">全部</button>
      </div>
      <div class="rv-slider-group">
        <span class="rv-slider-label">阈值 {{ (threshold * 100).toFixed(0) }}%</span>
        <input type="range" min="0.05" max="0.95" step="0.05" v-model.number="threshold" />
      </div>
      <label class="rv-check"><input type="checkbox" v-model="cleanTags" /> 清洗标签</label>
      <button class="rv-go" :disabled="!imageBase64 || isProcessing" @click="runReverse">{{ isProcessing ? '处理中...' : '🔮 开始反推' }}</button>
      <button class="rv-clr" @click="clearAll">清除</button>
    </div>

    <!-- Results -->
    <div class="rv-results" v-if="tags.length > 0 || naturalText">
      <div class="rv-nl-block" v-if="naturalText">
        <div class="rv-nl-label">📝 自然语言描述</div>
        <p class="rv-nl-text">{{ naturalText }}</p>
      </div>
      <div class="rv-tags-head" v-if="tags.length > 0">
        <span class="rv-tags-count">{{ tags.length }} 个标签</span>
        <input class="rv-tags-filter" v-model="activeTagFilter" placeholder="筛选标签..." />
        <button class="rv-copy-btn" @click="copyAll">{{ copied ? '✓ 已复制' : '📋 复制全部' }}</button>
      </div>
      <div class="rv-tags-wall" v-if="displayTags.length > 0">
        <span v-for="(t, i) in displayTags" :key="i" class="rv-tag-pill" :class="{ top: i < Math.ceil(tags.length * 0.3) }">
          {{ t }}<button @click="removeTag(i)">×</button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rv-root { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.rv-hero { border: 2px dashed rgba(255,255,255,0.08); border-radius: 16px; min-height: 260px; display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; overflow: hidden; transition: all 0.3s; background: rgba(255,255,255,0.01); }
.rv-hero.hover { border-color: #ff69b4; background: rgba(255,105,180,0.04); }
.rv-hero.loaded { border-style: solid; border-color: rgba(255,255,255,0.04); }
.rv-hero-img { width: 100%; height: 100%; object-fit: contain; max-height: 400px; border-radius: 12px; }
.rv-hero-overlay { position: absolute; bottom: 12px; left: 12px; display: flex; gap: 8px; align-items: center; }
.rv-hero-fn { font-size: 11px; color: #fff; background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 6px; }
.rv-hero-change { font-size: 10px; background: rgba(255,105,180,0.3); border: 1px solid rgba(255,105,180,0.3); color: #fff; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.rv-hero-empty { text-align: center; }
.rv-hero-icon { font-size: 56px; display: block; margin-bottom: 12px; }
.rv-hero-empty h1 { font-size: 22px; font-weight: 700; color: #e5e7eb; margin: 0 0 6px; }
.rv-hero-empty p { font-size: 13px; color: #6b7280; margin: 0; }

.rv-strip { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: rgba(24,24,26,0.6); border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; flex-wrap: wrap; }
.rv-chip-row { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06); }
.rv-chip-row button { padding: 6px 12px; border: none; background: none; color: #6b7280; font-size: 11px; cursor: pointer; }
.rv-chip-row button.on { background: rgba(255,105,180,0.12); color: #ff69b4; }
.rv-slider-group { display: flex; align-items: center; gap: 6px; }
.rv-slider-label { font-size: 10px; color: #6b7280; white-space: nowrap; }
.rv-slider-group input[type=range] { width: 60px; accent-color: #ff69b4; }
.rv-check { font-size: 11px; color: #9ca3af; display: flex; align-items: center; gap: 4px; cursor: pointer; }
.rv-check input { accent-color: #ff69b4; }
.rv-go { padding: 8px 20px; background: linear-gradient(135deg, #ff69b4, #ff85c2); border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }
.rv-go:disabled { opacity: 0.3; cursor: not-allowed; }
.rv-clr { padding: 6px 14px; background: none; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; color: #6b7280; font-size: 11px; cursor: pointer; }

.rv-results { display: flex; flex-direction: column; gap: 10px; }
.rv-nl-block { background: rgba(24,24,26,0.6); border: 1px solid rgba(255,255,255,0.04); border-radius: 12px; padding: 16px; }
.rv-nl-label { font-size: 10px; font-weight: 700; color: #ff69b4; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
.rv-nl-text { font-size: 14px; color: #d1d5db; line-height: 1.8; margin: 0; }
.rv-tags-head { display: flex; align-items: center; gap: 10px; }
.rv-tags-count { font-size: 13px; font-weight: 600; color: #d1d5db; }
.rv-tags-filter { padding: 5px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; color: #e5e7eb; font-size: 11px; width: 180px; }
.rv-copy-btn { margin-left: auto; padding: 5px 12px; background: none; border: 1px solid rgba(255,105,180,0.15); border-radius: 6px; color: #ff69b4; font-size: 11px; cursor: pointer; }
.rv-tags-wall { display: flex; flex-wrap: wrap; gap: 6px; }
.rv-tag-pill { display: flex; align-items: center; gap: 4px; padding: 7px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; font-size: 12px; color: #9ca3af; }
.rv-tag-pill.top { color: #22c55e; background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.1); font-weight: 500; }
.rv-tag-pill button { background: none; border: none; color: inherit; opacity: 0.4; font-size: 13px; cursor: pointer; padding: 0; }
.rv-tag-pill button:hover { opacity: 1; }
</style>

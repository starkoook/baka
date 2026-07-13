<script setup lang="ts">
import { ref, computed } from 'vue'; import { useAppStore } from '@/stores/app'; import { playSuccess } from '@/composables/useSound'
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
</script>

<template>
  <div class="rv-root">
    <!-- ═══ HERO UPLOAD ═══ -->
    <div
      class="rv-hero"
      :class="{ loaded: imagePreview, hover: isDragover }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
      @click="!imagePreview && selectFile()"
    >
      <div class="rv-hero-glow" aria-hidden="true"></div>
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
          <h2>拖入图片开始反推</h2>
          <p>支持 JPEG / PNG / WebP · 本地 ONNX 或云端 LLM</p>
        </div>
      </template>
    </div>

    <!-- ═══ CONTROL STRIP ═══ -->
    <div class="cabin-panel rv-strip">
      <span class="cabin-label">/// CONTROL</span>
      <div class="cabin-panel-br"></div>

      <!-- Engine & Format row -->
      <div class="rv-ctrl-row">
        <div class="rv-seg-group">
          <span class="rv-seg-label">引擎</span>
          <div class="rv-seg">
            <button :class="{ on: engineMode === 'api' }" @click="engineMode = 'api'">☁ API</button>
            <button :class="{ on: engineMode === 'local' }" @click="engineMode = 'local'">💻 本地</button>
          </div>
        </div>
        <div class="rv-seg-group" v-if="engineMode === 'api'">
          <span class="rv-seg-label">格式</span>
          <div class="rv-seg">
            <button :class="{ on: outputFormat === 'danbooru' }" @click="outputFormat = 'danbooru'">标签</button>
            <button :class="{ on: outputFormat === 'natural' }" @click="outputFormat = 'natural'">描述</button>
            <button :class="{ on: outputFormat === 'both' }" @click="outputFormat = 'both'">全部</button>
          </div>
        </div>
      </div>

      <!-- Slider + Checkbox row -->
      <div class="rv-ctrl-row rv-ctrl-bottom">
        <div class="rv-slider-group">
          <span class="rv-slider-label">阈值 <strong>{{ (threshold * 100).toFixed(0) }}%</strong></span>
          <input type="range" min="0.05" max="0.95" step="0.05" v-model.number="threshold" class="form-range" />
        </div>
        <label class="rv-check">
          <input type="checkbox" v-model="cleanTags" />
          <span class="rv-check-mark"></span>
          清洗标签
        </label>
      </div>

      <!-- Actions -->
      <div class="rv-actions">
        <button
          class="btn btn-primary rv-go"
          :disabled="!imageBase64 || isProcessing"
          @click="runReverse"
        >{{ isProcessing ? '⌛ 处理中...' : '🔮 开始反推' }}</button>
        <button class="btn-secondary rv-clr" @click="clearAll">清除</button>
      </div>
    </div>

    <!-- ═══ RESULTS ═══ -->
    <div class="rv-results" v-if="tags.length > 0 || naturalText">
      <!-- Natural language block -->
      <div class="cabin-panel rv-nl-block" v-if="naturalText">
        <span class="cabin-label">/// NATURAL</span>
        <div class="cabin-panel-br"></div>
        <div class="rv-nl-label">📝 自然语言描述</div>
        <p class="rv-nl-text">{{ naturalText }}</p>
      </div>

      <!-- Tag header -->
      <div class="rv-tags-head" v-if="tags.length > 0">
        <span class="rv-tags-count">{{ tags.length }} 个标签</span>
        <input class="rv-tags-filter" v-model="activeTagFilter" placeholder="筛选标签..." />
        <button class="btn btn-secondary btn-sm" @click="copyAll">{{ copied ? '✓ 已复制' : '📋 复制全部' }}</button>
      </div>

      <!-- Tag wall -->
      <div class="rv-tags-wall" v-if="displayTags.length > 0">
        <span
          v-for="(t, i) in displayTags" :key="i"
          class="rv-tag"
          :class="{ top: i < Math.ceil(tags.length * 0.3) }"
        >
          {{ t }}
          <button class="rv-tag-x" @click="removeTag(i)">×</button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rv-root {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ═══ HERO UPLOAD ═══ */
.rv-hero {
  position: relative;
  min-height: 260px;
  border: 2px dashed var(--border-default);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: all var(--transition-base);
  background: var(--glass-bg);
  backdrop-filter: blur(8px);
}
.rv-hero.hover {
  border-color: var(--accent-primary);
  background: var(--accent-bg);
  box-shadow: var(--accent-glow);
  transform: scale(1.01);
}
.rv-hero.loaded {
  border-style: solid;
  border-color: var(--glass-border);
  min-height: auto;
}

.rv-hero-glow {
  position: absolute;
  width: 200px; height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(244,114,182,0.06) 0%, transparent 70%);
  pointer-events: none;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}

.rv-hero-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  max-height: 400px;
  border-radius: var(--radius-md);
}
.rv-hero-overlay {
  position: absolute;
  bottom: 12px; left: 12px;
  display: flex; gap: 8px; align-items: center;
}
.rv-hero-fn {
  font-size: 11px;
  color: var(--text-primary);
  background: var(--hud-bg);
  padding: 4px 10px; border-radius: var(--radius-xs);
  border: 1px solid var(--hud-border);
}
.rv-hero-change {
  font-size: 10px;
  background: var(--accent-bg);
  border: 1px solid var(--border-accent);
  color: var(--accent-primary);
  padding: 4px 10px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.rv-hero-change:hover {
  background: var(--accent-bg-hover);
}

.rv-hero-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 20px;
  text-align: center;
}
.rv-hero-icon { font-size: 42px; opacity: 0.5; }
.rv-hero-empty h2 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.rv-hero-empty p {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}

/* ═══ CONTROL STRIP ═══ */
.rv-strip {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 22px 18px;
}

.rv-ctrl-row {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  flex-wrap: wrap;
}
.rv-ctrl-bottom {
  align-items: center;
}

/* ── Segmented control ── */
.rv-seg-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rv-seg-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.rv-seg {
  display: flex;
  border-radius: var(--radius-full);
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  overflow: hidden;
}
.rv-seg button {
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}
.rv-seg button:hover {
  color: var(--text-secondary);
}
.rv-seg button.on {
  color: var(--accent-primary);
  background: var(--accent-bg);
}
.rv-seg button + button::before {
  content: '';
  position: absolute;
  left: 0; top: 20%;
  height: 60%;
  width: 1px;
  background: var(--hud-border);
}

/* ── Slider ── */
.rv-slider-group {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rv-slider-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}
.rv-slider-label strong {
  color: var(--accent-primary);
}

/* ── Checkbox ── */
.rv-check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  padding: 6px 0;
}
.rv-check input { display: none; }
.rv-check-mark {
  width: 16px; height: 16px;
  border: 2px solid var(--border-default);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}
.rv-check input:checked + .rv-check-mark {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}
.rv-check input:checked + .rv-check-mark::after {
  content: '✓';
  font-size: 10px;
  color: #fff;
  font-weight: 700;
}

/* ── Actions ── */
.rv-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.rv-go { flex: 1; }
.rv-clr {
  padding: 11px 22px;
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  background: var(--glass-bg);
  color: var(--text-tertiary);
  border: 1px solid var(--glass-border);
}
.rv-clr:hover {
  background: var(--glass-bg-hover);
  border-color: var(--border-accent);
  color: var(--text-primary);
}

/* ═══ RESULTS ═══ */
.rv-results {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Natural language ── */
.rv-nl-block { padding: 20px 20px 16px; }
.rv-nl-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}
.rv-nl-text {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  margin: 0;
  padding: 12px 14px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--hud-inset-shadow);
}

/* ── Tag header bar ── */
.rv-tags-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 4px;
}
.rv-tags-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}
.rv-tags-filter {
  flex: 1;
  max-width: 220px;
  padding: 6px 12px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-full);
  color: var(--text-primary);
  font-size: 11px;
  font-family: var(--font-sans);
  transition: all var(--transition-fast);
}
.rv-tags-filter:focus {
  outline: none;
  border-color: var(--border-accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-primary-rgb), 0.1);
}
.rv-tags-filter::placeholder { color: var(--text-tertiary); }

/* ── Tag wall ── */
.rv-tags-wall {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 14px;
  background: var(--hud-bg);
  border: 1px solid var(--hud-border);
  border-radius: var(--radius-md);
  box-shadow: var(--hud-inset-shadow);
}

.rv-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px 4px 12px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-full);
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  transition: all var(--transition-fast);
  animation: rv-pop-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.rv-tag:hover {
  background: var(--glass-bg-hover);
  border-color: var(--border-accent);
  color: var(--text-primary);
}
.rv-tag.top {
  background: var(--accent-bg);
  border-color: rgba(var(--accent-primary-rgb), 0.2);
  color: var(--accent-primary);
}
.rv-tag-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px; height: 14px;
  padding: 0;
  border: none;
  background: rgba(255,255,255,0.04);
  color: var(--text-tertiary);
  border-radius: 50%;
  font-size: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  line-height: 1;
}
.rv-tag-x:hover {
  background: rgba(239,68,68,0.2);
  color: var(--accent-danger);
}

@keyframes rv-pop-in {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
</style>

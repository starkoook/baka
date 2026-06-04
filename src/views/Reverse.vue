<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { playSuccess } from '@/composables/useSound'

const appStore = useAppStore()

const isDragover = ref(false)
const imageBase64 = ref<string | null>(null)
const imagePreview = ref<string | null>(null)
const fileName = ref<string | null>(null)
const isProcessing = ref(false)
const promptText = ref('')
const copied = ref(false)

// ── Drag & drop ──
function onDragOver(e: DragEvent) { e.preventDefault(); isDragover.value = true }
function onDragLeave() { isDragover.value = false }

async function loadFile(file: File) {
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    imagePreview.value = dataUrl
    imageBase64.value = dataUrl.split(',')[1] || ''
  }
  reader.readAsDataURL(file)
}

function onDrop(e: DragEvent) {
  e.preventDefault(); isDragover.value = false
  if (e.dataTransfer?.files.length) loadFile(e.dataTransfer.files[0])
}

function selectFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/webp'
  input.onchange = () => { if (input.files?.length) loadFile(input.files[0]) }
  input.click()
}

// ── Reverse prompt via LLM ──
async function runReverse() {
  if (!imageBase64.value || !window.llmAPI) return
  isProcessing.value = true
  promptText.value = ''
  appStore.setStatus('反推中...')

  try {
    const res = await window.llmAPI.tagImage({
      imageBase64: imageBase64.value,
      prompt: `Analyze this image in extreme detail. Describe it as a Stable Diffusion / NovelAI prompt. Include: character appearance, art style, lighting, background, composition, quality tags. Output ONLY comma-separated tags. Be comprehensive.`
    })
    if (res.success && res.tags) {
      promptText.value = res.tags.join(', ')
      appStore.setStatus('反推完成')
      playSuccess()
    } else {
      promptText.value = '反推失败: ' + (res.error || '未知错误')
    }
  } catch (e: any) {
    promptText.value = '反推失败: ' + (e.message || '未知错误')
  }

  isProcessing.value = false
}

async function copyPrompt() {
  if (!promptText.value) return
  try {
    await navigator.clipboard.writeText(promptText.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Fallback
    const ta = document.createElement('textarea')
    ta.value = promptText.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

function handleClear() {
  imageBase64.value = null
  imagePreview.value = null
  fileName.value = null
  promptText.value = ''
  appStore.setStatus('就绪')
}
</script>

<template>
  <div class="reverse-page">
    <div class="page-header">
      <h1 class="page-title">提示词反推</h1>
      <p class="page-desc">上传图片，AI 反推出可用于生成的提示词</p>
    </div>

    <div class="reverse-layout">
      <!-- Left: Upload -->
      <div class="panel glass-panel">
        <h3 class="panel-title">输入图像</h3>
        <div
          class="drop-zone"
          :class="{ dragover: isDragover, hasFile: fileName }"
          @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @click="selectFile"
        >
          <template v-if="!imagePreview">
            <div class="drop-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
            <p class="drop-text">拖拽图像到此处</p>
            <p class="drop-hint">或点击选择 · JPG / PNG / WEBP</p>
          </template>
          <template v-else>
            <img :src="imagePreview" class="preview-img" />
            <p class="drop-text selected">{{ fileName }}</p>
            <p class="drop-hint">点击更换图像</p>
          </template>
        </div>

        <div class="btn-group">
          <button class="action-btn" :disabled="!fileName || isProcessing" @click="runReverse">
            <span class="action-btn-icon">
              <svg v-if="isProcessing" class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
              </svg>
              <span v-else>🔮</span>
            </span>
            <span class="action-btn-text">{{ isProcessing ? '反推中...' : '开始反推' }}</span>
          </button>
          <button class="clear-btn" :disabled="!fileName && !promptText" @click="handleClear">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><line x1="10" y1="10" x2="10" y2="18"/><line x1="14" y1="10" x2="14" y2="18"/></svg>
            清除
          </button>
        </div>
      </div>

      <!-- Right: Result -->
      <div class="panel glass-panel panel-result">
        <h3 class="panel-title">反推结果</h3>

        <div class="result-box" v-if="promptText">
          <div class="prompt-content">{{ promptText }}</div>
          <div class="result-actions">
            <button class="copy-btn" @click="copyPrompt">
              {{ copied ? '✓ 已复制' : '📋 复制提示词' }}
            </button>
            <span class="prompt-stats">{{ promptText.split(',').length }} 个标签</span>
          </div>
        </div>

        <div class="empty-state" v-else-if="!isProcessing">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
          <p>拖入图片后点击「开始反推」</p>
          <p style="font-size: 11px; margin-top: 4px;">使用设置中配置的 LLM 模型进行反推</p>
        </div>

        <div class="loading-state" v-if="isProcessing">
          <div class="shimmer" style="width: 100%; height: 60px; border-radius: var(--radius-sm);"></div>
          <div class="shimmer" style="width: 70%; height: 16px; border-radius: var(--radius-sm); margin-top: 8px;"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reverse-page { max-width: 960px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; letter-spacing: -0.01em; }
.page-desc { font-size: 13px; color: var(--text-tertiary); }
.reverse-layout { display: grid; grid-template-columns: 340px 1fr; gap: 18px; align-items: start; }

.panel { padding: 20px; }
.panel-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 14px; }
.panel-result { background: #18131b; border: 1px solid rgba(var(--accent-primary-rgb), 0.15); border-radius: var(--radius-lg); min-height: 300px; box-shadow: 0 0 16px rgba(var(--accent-primary-rgb), 0.08), 0 0 40px rgba(var(--accent-primary-rgb), 0.04), inset 0 0 40px rgba(0,0,0,0.15); }

/* Drop zone */
.drop-zone {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 36px 20px; border: 2px dashed var(--glass-border);
  border-radius: var(--radius-md); cursor: pointer;
  transition: all var(--transition-base); margin-bottom: 18px;
  background: var(--glass-bg); overflow: hidden; min-height: 160px;
}
.drop-zone:hover { border-color: var(--border-accent); background: var(--glass-bg-hover); }
.drop-zone.dragover { border-color: var(--accent-primary); background: var(--accent-bg); box-shadow: var(--accent-glow); }
.drop-zone.hasFile { border-color: rgba(var(--accent-primary-rgb), 0.4); border-style: solid; background: var(--accent-bg); padding: 12px; }
.drop-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); background: var(--glass-bg); color: var(--text-tertiary); margin-bottom: 12px; }
.drop-icon svg { width: 28px; height: 28px; }
.preview-img { max-width: 100%; max-height: 180px; border-radius: var(--radius-sm); object-fit: contain; margin-bottom: 8px; }
.drop-text { font-size: 14px; color: var(--text-secondary); margin-bottom: 4px; font-weight: 500; }
.drop-text.selected { color: var(--accent-primary); }
.drop-hint { font-size: 11px; color: var(--text-tertiary); }
.full-width { width: 100%; }
.btn-group { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }

/* ── Action button ── */
.action-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; padding: 14px 20px;
  border: none; border-radius: var(--radius-full);
  background: var(--gradient-accent);
  color: #fff; font-size: 15px; font-weight: 700;
  font-family: var(--font-sans); cursor: pointer;
  letter-spacing: 0.03em;
  box-shadow: 0 4px 20px rgba(var(--accent-primary-rgb), 0.35);
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative; overflow: hidden;
}
.action-btn::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 50%);
  pointer-events: none;
}
.action-btn:hover { transform: scale(1.03); box-shadow: 0 8px 30px rgba(var(--accent-primary-rgb), 0.5); }
.action-btn:active { transform: scale(0.96); }
.action-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; box-shadow: none; }
.action-btn-icon { font-size: 20px; flex-shrink: 0; line-height: 1; }
.action-btn-text { white-space: nowrap; }

/* ── Clear button ── */
.clear-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 10px 16px;
  border: 1px solid var(--glass-border); border-radius: var(--radius-full);
  background: var(--glass-bg); backdrop-filter: blur(6px);
  color: var(--text-tertiary); font-size: 12px; font-weight: 500;
  font-family: var(--font-sans); cursor: pointer;
  transition: all 0.25s ease;
}
.clear-btn:hover { background: rgba(248, 113, 113, 0.1); border-color: rgba(248, 113, 113, 0.25); color: #f87171; }
.clear-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ── Copy button ── */
.copy-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 20px; border: none; border-radius: var(--radius-full);
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.2), rgba(var(--accent-secondary-rgb), 0.15));
  border: 1px solid rgba(var(--accent-primary-rgb), 0.2);
  color: var(--accent-primary); font-size: 13px; font-weight: 600;
  font-family: var(--font-sans); cursor: pointer;
  transition: all 0.25s ease;
}
.copy-btn:hover { background: rgba(var(--accent-primary-rgb), 0.25); transform: scale(1.03); }

/* Result */
.result-box { position: relative; z-index: 1; }
.prompt-content {
  padding: 16px; background: rgba(255,255,255,0.03);
  border: 1px solid var(--glass-border); border-radius: var(--radius-sm);
  font-size: 13px; line-height: 1.7; color: var(--text-primary);
  word-break: break-all; min-height: 60px; max-height: 400px; overflow-y: auto;
  font-family: var(--font-mono); font-size: 12px;
}
.result-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.prompt-stats { font-size: 11px; color: var(--text-tertiary); }

.loading-state { position: relative; z-index: 1; padding: 12px 0; }
.shimmer {
  background: linear-gradient(90deg, var(--glass-bg) 25%, var(--glass-bg-hover) 50%, var(--glass-bg) 75%);
  background-size: 200px 100%; animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 24px; color: var(--text-tertiary); text-align: center; }
.empty-state svg { width: 44px; height: 44px; margin-bottom: 12px; opacity: 0.25; }
.empty-state p { font-size: 13px; }
</style>

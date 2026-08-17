<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ImageEditorCanvas from '@/components/common/ImageEditorCanvas.vue'

type ToolTab = 'background' | 'transparent' | 'editor' | 'similar' | 'bad' | 'effects'

const tab = ref<ToolTab>('background')
const inputPaths = ref<string[]>([])
const busy = ref(false)
const error = ref('')
const status = ref('')
const preview = ref('')
const lastOutputPath = ref('')

const backgroundOptions = ref({ tolerance: 45, feather: 2 })
const backgroundMode = ref<'classic' | 'ai'>('classic')
const aiModelInstalled = ref(false)
const aiDownloadProgress = ref('')
const transparentColor = ref('#ffffff')
const editorOptions = ref({
  resizeWidth: 0,
  resizeHeight: 0,
  rotate: 0,
  flip: false,
  flop: false,
  grayscale: false,
  brightness: 1,
  saturation: 1,
})
const similarityThreshold = ref(8)
const similarGroups = ref<SimilarImageGroup[][]>([])
const badResults = ref<BadImageResult[]>([])
const effects = ref<EffectEntry[]>([])
const effectType = ref('brightnessContrast')
const effectValue1 = ref(0)
const effectValue2 = ref(0)
const effectValue3 = ref(0)
const effectValue4 = ref(0)
const effectValue5 = ref(0)
const effectColor = ref('#ffffff')
const effectsPresets = ref<{ name: string; effects: EffectEntry[] }[]>([])
const presetName = ref('')

const effectTypeOptions = [
  { value: 'brightnessContrast', label: '亮度/对比度' },
  { value: 'saturationVibrance', label: '饱和度/鲜艳度' },
  { value: 'temperatureTint', label: '色温/色调' },
  { value: 'gamma', label: 'Gamma' },
  { value: 'vignette', label: '暗角' },
  { value: 'noise', label: '噪点' },
  { value: 'pixelate', label: '像素化' },
  { value: 'solidBlock', label: '纯色块' },
  { value: 'scanline', label: '扫描线' },
  { value: 'glow', label: '发光' },
  { value: 'radialBlur', label: '径向模糊' },
  { value: 'chromaticAberration', label: '色差' },
  { value: 'jpegLoss', label: 'JPEG 损失' },
]

const currentFile = computed(() => inputPaths.value[0]?.split(/[/\\]/).pop() || '')
const currentPath = computed(() => inputPaths.value[0] || '')

async function chooseImages() {
  const paths = await window.fsAPI.selectImages()
  if (paths?.length) {
    inputPaths.value = paths
    resetResults()
    await showOriginal(paths[0])
  }
}

async function chooseFolder() {
  const folderPath = await window.fsAPI.selectFolder()
  if (!folderPath) return
  const files = await window.fsAPI.listImages(folderPath)
  if (files.length) {
    inputPaths.value = files.map((file) => file.path)
    resetResults()
    await showOriginal(files[0].path)
  }
}

async function showOriginal(filePath: string) {
  if (!window.fsAPI) return
  const response = await window.fsAPI.readImageBase64(filePath)
  if (response.success && response.base64) {
    preview.value = `data:${response.mime || 'image/png'};base64,${response.base64}`
  }
}

async function refreshAiModelInfo() {
  if (!window.imageToolsAPI) return
  const response = await window.imageToolsAPI.getAiModelInfo()
  if (response.success && response.data) aiModelInstalled.value = response.data.installed
}

async function downloadAiModel() {
  if (!window.imageToolsAPI || busy.value) return
  busy.value = true
  error.value = ''
  aiDownloadProgress.value = '准备下载…'
  const response = await window.imageToolsAPI.downloadAiModel()
  busy.value = false
  aiDownloadProgress.value = ''
  if (!response.success) {
    error.value = response.error || '模型下载失败'
    return
  }
  await refreshAiModelInfo()
  status.value = 'AI 抠图模型下载完成，可以开始处理。'
}

function resetResults() {
  preview.value = ''
  lastOutputPath.value = ''
  error.value = ''
  status.value = ''
  similarGroups.value = []
  badResults.value = []
}

function dataUrl(result: ImageToolResult) {
  return `data:image/png;base64,${result.base64}`
}

async function processSingle(kind: 'background' | 'transparent' | 'editor') {
  if (!currentPath.value || !window.imageToolsAPI) return
  busy.value = true
  error.value = ''
  status.value = '处理中…'
  let response
  if (kind === 'background') {
    if (backgroundMode.value === 'ai') {
      response = await window.imageToolsAPI.removeBackgroundAi({ inputPath: currentPath.value })
    } else {
      response = await window.imageToolsAPI.removeBackground({
        inputPath: currentPath.value,
        tolerance: backgroundOptions.value.tolerance,
        feather: backgroundOptions.value.feather,
      })
    }
  } else if (kind === 'transparent') {
    response = await window.imageToolsAPI.replaceTransparentBackground({
      inputPath: currentPath.value,
      color: transparentColor.value,
    })
  } else {
    response = await window.imageToolsAPI.edit({
      inputPath: currentPath.value,
      operation: {
        resize: {
          width: editorOptions.value.resizeWidth || undefined,
          height: editorOptions.value.resizeHeight || undefined,
        },
        rotate: editorOptions.value.rotate || undefined,
        flip: editorOptions.value.flip,
        flop: editorOptions.value.flop,
        grayscale: editorOptions.value.grayscale,
        modulate: {
          brightness: editorOptions.value.brightness,
          saturation: editorOptions.value.saturation,
        },
      },
    })
  }
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '处理失败'
    return
  }
  preview.value = dataUrl(response.data)
  lastOutputPath.value = response.data.outputPath
  status.value = `完成：${lastOutputPath.value}`
}

async function processBatch(kind: 'background' | 'transparent' | 'editor') {
  if (!inputPaths.value.length || !window.imageToolsAPI) return
  busy.value = true
  error.value = ''
  let done = 0
  let failed = 0
  for (const inputPath of inputPaths.value) {
    let response
    if (kind === 'background') {
      if (backgroundMode.value === 'ai') {
        response = await window.imageToolsAPI.removeBackgroundAi({ inputPath })
      } else {
        response = await window.imageToolsAPI.removeBackground({
          inputPath,
          tolerance: backgroundOptions.value.tolerance,
          feather: backgroundOptions.value.feather,
        })
      }
    } else if (kind === 'transparent') {
      response = await window.imageToolsAPI.replaceTransparentBackground({ inputPath, color: transparentColor.value })
    } else {
      response = await window.imageToolsAPI.edit({
        inputPath,
        operation: {
          resize: {
            width: editorOptions.value.resizeWidth || undefined,
            height: editorOptions.value.resizeHeight || undefined,
          },
          rotate: editorOptions.value.rotate || undefined,
          flip: editorOptions.value.flip,
          flop: editorOptions.value.flop,
          grayscale: editorOptions.value.grayscale,
          modulate: {
            brightness: editorOptions.value.brightness,
            saturation: editorOptions.value.saturation,
          },
        },
      })
    }
    if (response.success) done++
    else failed++
    status.value = `已处理 ${done + failed} / ${inputPaths.value.length}`
  }
  busy.value = false
  status.value = `批量完成：成功 ${done} 张，失败 ${failed} 张`
  if (failed) error.value = '部分图片处理失败，请在结果中检查。'
}

async function savePreview() {
  if (!preview.value) return
  await window.fsAPI.saveImage({
    dataUrl: preview.value,
    defaultName: currentFile.value.replace(/\.[^.]+$/, '') + '-output.png',
  })
}

async function saveEditorResult(dataUrl: string) {
  await window.fsAPI.saveImage({
    dataUrl,
    defaultName: currentFile.value.replace(/\.[^.]+$/, '') + '-edited.png',
  })
  status.value = '已保存编辑结果'
}

async function runSimilar() {
  if (!inputPaths.value.length || !window.imageToolsAPI) return
  busy.value = true
  error.value = ''
  const response = await window.imageToolsAPI.similar({
    paths: inputPaths.value,
    threshold: similarityThreshold.value,
  })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '相似图扫描失败'
    return
  }
  similarGroups.value = response.data.groups
  status.value = `扫描 ${response.data.compared} 张，找到 ${response.data.groups.length} 组相似图`
}

async function runBadScan() {
  if (!inputPaths.value.length || !window.imageToolsAPI) return
  busy.value = true
  error.value = ''
  const response = await window.imageToolsAPI.badScan({ paths: inputPaths.value })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '坏图扫描失败'
    return
  }
  badResults.value = response.data.results
  status.value = `扫描完成，${badResults.value.filter((item) => item.status === 'bad').length} 张有问题`
}

function addEffect() {
  effects.value.push({
    type: effectType.value,
    value1: effectValue1.value,
    value2: effectValue2.value,
    value3: effectValue3.value,
    value4: effectValue4.value,
    value5: effectValue5.value,
    textValue: effectColor.value,
  })
}

function removeEffect(index: number) {
  effects.value.splice(index, 1)
}

function moveEffect(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= effects.value.length) return
  const [item] = effects.value.splice(index, 1)
  effects.value.splice(target, 0, item)
}

async function applyEffects() {
  if (!currentPath.value || !window.effectsAPI) return
  busy.value = true
  error.value = ''
  status.value = '处理中…'
  const response = await window.effectsAPI.render({ inputPath: currentPath.value, effects: effects.value })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '处理失败'
    return
  }
  preview.value = `data:image/png;base64,${response.data.base64}`
  lastOutputPath.value = response.data.outputPath || ''
  status.value = '特效已应用'
}

async function loadEffectsPresets() {
  if (!window.effectsAPI) return
  const response = await window.effectsAPI.listPresets()
  if (response.success && response.data) effectsPresets.value = response.data.presets
}

async function saveEffectsPreset() {
  if (!presetName.value.trim() || !window.effectsAPI) return
  await window.effectsAPI.savePreset({ name: presetName.value, effects: effects.value })
  status.value = '预设已保存'
  await loadEffectsPresets()
}

async function deleteEffectsPreset(name: string) {
  if (!window.effectsAPI) return
  await window.effectsAPI.deletePreset(name)
  await loadEffectsPresets()
}

function useEffectsPreset(preset: { effects: EffectEntry[] }) {
  effects.value = preset.effects.map((effect) => ({ ...effect }))
}

onMounted(() => {
  void refreshAiModelInfo()
  void loadEffectsPresets()
  window.imageToolsAPI?.onDownloadAiProgress((event) => {
    if (event.total) {
      aiDownloadProgress.value = `下载中 ${Math.round(event.received / event.total * 100)}%`
    } else {
      aiDownloadProgress.value = `下载中 ${Math.round(event.received / 1024 / 1024)} MB`
    }
  })
})
</script>

<template>
  <main class="image-tools">
    <header class="page-head">
      <div><span>IMAGE TOOLS</span><h1>图像工具</h1><p>背景处理、基础编辑、相似图与坏图扫描。</p></div>
      <div class="source-actions">
        <button @click="chooseImages">选择图片</button>
        <button @click="chooseFolder">选择文件夹</button>
      </div>
    </header>

    <div class="tool-tabs">
      <button :class="{ active: tab === 'background' }" @click="tab = 'background'">背景移除</button>
      <button :class="{ active: tab === 'transparent' }" @click="tab = 'transparent'">透明背景替换</button>
      <button :class="{ active: tab === 'editor' }" @click="tab = 'editor'">图片编辑器</button>
      <button :class="{ active: tab === 'similar' }" @click="tab = 'similar'">相似图查找</button>
      <button :class="{ active: tab === 'bad' }" @click="tab = 'bad'">坏图扫描</button>
      <button :class="{ active: tab === 'effects' }" @click="tab = 'effects'">特效链</button>
    </div>

    <section class="tool-body">
      <aside class="control-panel">
        <template v-if="tab === 'background'">
          <h2>背景移除</h2>
          <div class="mode-switch">
            <button :class="{ active: backgroundMode === 'classic' }" @click="backgroundMode = 'classic'">经典抠图</button>
            <button :class="{ active: backgroundMode === 'ai' }" @click="backgroundMode = 'ai'">AI 抠图</button>
          </div>
          <template v-if="backgroundMode === 'classic'">
            <label>容差 <strong>{{ backgroundOptions.tolerance }}</strong><input v-model.number="backgroundOptions.tolerance" type="range" min="0" max="120" /></label>
            <label>边缘羽化 <strong>{{ backgroundOptions.feather }}</strong><input v-model.number="backgroundOptions.feather" type="range" min="0" max="20" /></label>
            <p>适合背景颜色较统一的图片；复杂背景建议使用 AI 抠图。</p>
          </template>
          <template v-else>
            <p>AI 抠图能处理复杂背景，首次使用需要下载模型（约 170MB）。</p>
            <p v-if="aiModelInstalled" class="ai-ready">模型已就绪</p>
            <button v-else-if="!aiDownloadProgress" @click="downloadAiModel">下载 AI 抠图模型</button>
            <p v-else class="status">{{ aiDownloadProgress }}</p>
          </template>
          <div class="panel-actions">
            <button :disabled="busy || !currentPath" @click="processSingle('background')">处理当前</button>
            <button :disabled="busy || !inputPaths.length" @click="processBatch('background')">批量处理</button>
          </div>
        </template>

        <template v-else-if="tab === 'transparent'">
          <h2>透明背景替换</h2>
          <label>填充颜色 <input v-model="transparentColor" type="color" /></label>
          <p>把透明区域替换为纯色背景，适合生成缩略图或预览。</p>
          <div class="panel-actions">
            <button :disabled="busy || !currentPath" @click="processSingle('transparent')">处理当前</button>
            <button :disabled="busy || !inputPaths.length" @click="processBatch('transparent')">批量处理</button>
          </div>
        </template>

        <template v-else-if="tab === 'editor'">
          <h2>图片编辑器</h2>
          <div class="field-grid">
            <label>宽 <input v-model.number="editorOptions.resizeWidth" type="number" min="0" placeholder="0" /></label>
            <label>高 <input v-model.number="editorOptions.resizeHeight" type="number" min="0" placeholder="0" /></label>
          </div>
          <label>旋转角度 <input v-model.number="editorOptions.rotate" type="number" /></label>
          <div class="check-grid">
            <label><input v-model="editorOptions.flip" type="checkbox" /> 垂直翻转</label>
            <label><input v-model="editorOptions.flop" type="checkbox" /> 水平翻转</label>
            <label><input v-model="editorOptions.grayscale" type="checkbox" /> 黑白</label>
          </div>
          <label>亮度 <strong>{{ editorOptions.brightness.toFixed(2) }}</strong><input v-model.number="editorOptions.brightness" type="range" min="0.2" max="2" step="0.01" /></label>
          <label>饱和度 <strong>{{ editorOptions.saturation.toFixed(2) }}</strong><input v-model.number="editorOptions.saturation" type="range" min="0" max="2" step="0.01" /></label>
          <div class="panel-actions">
            <button :disabled="busy || !currentPath" @click="processSingle('editor')">应用变换</button>
            <button :disabled="busy || !inputPaths.length" @click="processBatch('editor')">批量变换</button>
          </div>
        </template>

        <template v-else-if="tab === 'similar'">
          <h2>相似图查找</h2>
          <label>汉明距离阈值 <strong>{{ similarityThreshold }}</strong><input v-model.number="similarityThreshold" type="range" min="0" max="32" /></label>
          <p>数值越小越严格，只找几乎一样的图。</p>
          <button :disabled="busy || !inputPaths.length" @click="runSimilar">开始扫描</button>
        </template>

        <template v-else-if="tab === 'effects'">
          <h2>后处理特效链</h2>
          <div class="effect-builder">
            <select v-model="effectType">
              <option v-for="opt in effectTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <div class="field-grid">
              <label>参数1 <input v-model.number="effectValue1" type="number" step="0.1" /></label>
              <label>参数2 <input v-model.number="effectValue2" type="number" step="0.1" /></label>
              <label>参数3 <input v-model.number="effectValue3" type="number" step="0.1" /></label>
              <label>参数4 <input v-model.number="effectValue4" type="number" step="0.1" /></label>
              <label>参数5 <input v-model.number="effectValue5" type="number" step="0.1" /></label>
            </div>
            <label>颜色 <input v-model="effectColor" type="color" /></label>
            <button @click="addEffect">添加到链</button>
          </div>

          <div v-if="effects.length" class="effect-list">
            <div v-for="(effect, index) in effects" :key="index" class="effect-row">
              <span>{{ effectTypeOptions.find((item) => item.value === effect.type)?.label || effect.type }}</span>
              <button @click="moveEffect(index, -1)" :disabled="index === 0">↑</button>
              <button @click="moveEffect(index, 1)" :disabled="index === effects.length - 1">↓</button>
              <button @click="removeEffect(index)">✕</button>
            </div>
          </div>

          <div class="panel-actions">
            <button :disabled="busy || !currentPath || !effects.length" @click="applyEffects">应用到当前</button>
          </div>

          <h2>特效预设</h2>
          <div class="preset-save">
            <input v-model="presetName" placeholder="预设名称" />
            <button :disabled="!presetName.trim() || !effects.length" @click="saveEffectsPreset">保存</button>
          </div>
          <div v-if="effectsPresets.length" class="preset-list">
            <div v-for="preset in effectsPresets" :key="preset.name" class="preset-row">
              <button @click="useEffectsPreset(preset)">{{ preset.name }}</button>
              <button @click="deleteEffectsPreset(preset.name)">删除</button>
            </div>
          </div>
        </template>

        <template v-else>
          <h2>坏图扫描</h2>
          <p>检测无法解码、文件过小、分辨率过低和疑似空图。</p>
          <button :disabled="busy || !inputPaths.length" @click="runBadScan">开始扫描</button>
        </template>

        <p v-if="status" class="status">{{ status }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </aside>

      <section class="preview-panel">
        <div class="preview-head">
          <strong>{{ currentFile || '未选择图片' }}</strong>
          <span v-if="inputPaths.length">{{ inputPaths.length }} 张</span>
          <button v-if="preview && tab !== 'editor'" @click="savePreview">保存结果</button>
        </div>

        <div v-if="tab === 'editor' && preview" class="editor-stage"><ImageEditorCanvas :src="preview" :filename="currentFile" @save="saveEditorResult" /></div>
        <div v-else-if="preview" class="preview-image"><img :src="preview" alt="预览" /></div>

        <div v-else-if="tab === 'similar' && similarGroups.length" class="result-list">
          <div v-for="(group, index) in similarGroups" :key="index" class="result-card">
            <strong>相似组 {{ index + 1 }}</strong>
            <p v-for="item in group" :key="item.path">{{ item.path.split(/[/\\]/).pop() }}</p>
          </div>
        </div>

        <div v-else-if="tab === 'bad' && badResults.length" class="result-list">
          <div v-for="item in badResults" :key="item.path" class="result-card" :class="{ bad: item.status === 'bad' }">
            <strong>{{ item.path.split(/[/\\]/).pop() }}</strong>
            <p>{{ item.issues.length ? item.issues.join('、') : '正常' }} · {{ item.width }}×{{ item.height }}</p>
          </div>
        </div>

        <div v-else class="empty-state">选择图片后开始处理。</div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.image-tools { min-height: 100%; display: flex; flex-direction: column; gap: 16px; color: var(--text-primary); }
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.page-head span { color: var(--accent-primary); font-size: 9px; font-weight: 750; letter-spacing: .18em; }
.page-head h1 { margin: 5px 0 4px; font-size: 26px; }
.page-head p { margin: 0; color: var(--text-tertiary); font-size: 12px; }
.source-actions { display: flex; gap: 8px; }
.source-actions button { height: 36px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; }
.tool-tabs { display: flex; gap: 5px; padding: 4px; border: 1px solid rgba(255,255,255,.07); border-radius: 12px; background: rgba(255,255,255,.025); }
.tool-tabs button { flex: 1; height: 34px; border: 0; border-radius: 8px; background: transparent; color: var(--text-tertiary); cursor: pointer; font: inherit; font-size: 11px; }
.tool-tabs button.active { background: rgba(var(--accent-primary-rgb),.13); color: var(--accent-primary); }
.tool-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 280px minmax(0,1fr); gap: 14px; }
.control-panel { min-height: 0; padding: 16px; overflow: auto; border: 1px solid rgba(255,255,255,.07); border-radius: 14px; background: rgba(255,255,255,.025); }
.control-panel h2 { margin: 0 0 14px; font-size: 15px; }
.control-panel label { display: grid; gap: 7px; margin: 13px 0; color: var(--text-tertiary); font-size: 10px; }
.control-panel input:not([type='checkbox']), .control-panel button { box-sizing: border-box; width: 100%; height: 34px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; }
.control-panel input[type='range'] { height: auto; padding: 0; accent-color: var(--accent-primary); }
.control-panel input[type='color'] { padding: 4px; }
.control-panel p { color: var(--text-tertiary); font-size: 9px; line-height: 1.6; }
.control-panel button { cursor: pointer; }
.panel-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 16px; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.check-grid { display: grid; gap: 8px; }
.check-grid label { display: flex; align-items: center; gap: 7px; margin: 0; }
.check-grid input { width: auto; height: auto; }
.status { color: var(--text-tertiary); font-size: 9px; }
.error { color: #ff9a86; font-size: 9px; }
.preview-panel { min-height: 0; display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,.07); border-radius: 14px; background: #17151b; overflow: hidden; }
.preview-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.06); }
.preview-head strong { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 12px; }
.preview-head span { color: var(--text-tertiary); font-size: 9px; }
.preview-head button { height: 28px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; }
.preview-image { flex: 1; min-height: 0; display: grid; place-items: center; overflow: auto; padding: 20px; background: radial-gradient(circle at center,#221f27,#121116 72%); }
.preview-image img { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
.empty-state { flex: 1; display: grid; place-items: center; color: var(--text-tertiary); font-size: 12px; }
.result-list { flex: 1; overflow: auto; padding: 12px; display: grid; align-content: start; gap: 8px; }
.result-card { padding: 10px 12px; border: 1px solid rgba(255,255,255,.07); border-radius: 9px; background: rgba(255,255,255,.025); }
.result-card.bad { border-color: rgba(255,137,117,.28); background: rgba(255,137,117,.045); }
.result-card strong { display: block; color: var(--text-secondary); font-size: 10px; }
.result-card p { margin: 5px 0 0; color: var(--text-tertiary); font-size: 9px; }
@media (max-width: 900px) { .tool-body { grid-template-columns: 1fr; } }
.mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 4px; }.mode-switch button { height: 32px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 10px; }.mode-switch button.active { background: rgba(var(--accent-primary-rgb),.14); border-color: rgba(var(--accent-primary-rgb),.35); color: var(--accent-primary); }.ai-ready { color: #79d7a0; font-size: 10px; }
.editor-stage { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.effect-builder select, .effect-builder input, .preset-save input { box-sizing: border-box; width: 100%; height: 34px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; }
.effect-builder .field-grid label { color: var(--text-tertiary); font-size: 9px; }
.effect-list, .preset-list { display: grid; gap: 6px; margin-top: 14px; }
.effect-row, .preset-row { display: flex; align-items: center; gap: 6px; }
.effect-row span { flex: 1; color: var(--text-secondary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.effect-row button, .preset-row button { height: 28px; padding: 0 8px; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 10px; }
.effect-row button:disabled { opacity: .35; cursor: not-allowed; }
.preset-save { display: grid; grid-template-columns: 1fr auto; gap: 6px; margin-top: 10px; }
.preset-save button { height: 34px; padding: 0 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; font: inherit; }
.preset-row button:first-child { flex: 1; text-align: left; }
</style>

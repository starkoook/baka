<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useTaggerStore } from '@/stores/tagger'

const taggerStore = useTaggerStore()
const videoPath = ref('')
const info = ref<VideoProbeInfo | null>(null)
const mode = ref('all')
const fps = ref(1)
const count = ref(5)
const percent = ref(10)
const specificFrames = ref('')
const estimatedCount = ref(0)
const busy = ref(false)
const result = ref<string[]>([])
const previews = ref<string[]>([])
const error = ref('')
const taskId = ref('')
const progressText = ref('')
const autoTag = ref(false)
const models = ref<ModelInfo[]>([])
const activeModelPath = ref('')
const videoTags = ref<{ tag: string; count: number; frequency: number }[]>([])

async function pickVideo() {
  if (!window.fsAPI) return
  const paths = await window.fsAPI.selectVideos()
  if (!paths?.length) return
  videoPath.value = paths[0]
  info.value = null
  const response = await window.videoAPI.probe(videoPath.value)
  if (response.success && response.data) {
    info.value = response.data
    updateEstimate()
  }
}

async function loadModels() {
  if (!window.taggerV2API) return
  const response = await window.taggerV2API.listModels()
  if (response.success && response.data) {
    models.value = response.data.models
    if (!activeModelPath.value && models.value.length) activeModelPath.value = models.value[0].path
  }
}

async function start() {
  if (!videoPath.value || !window.videoAPI) return
  busy.value = true
  error.value = ''
  result.value = []
  const outputDir = `${videoPath.value}_frames`
  taskId.value = `video_extract_${Date.now()}`
  progressText.value = ''
  let response: any
  if (autoTag.value) {
    if (!activeModelPath.value) {
      busy.value = false
      error.value = '请先选择一个打标模型。'
      return
    }
    const model = models.value.find((item) => item.path === activeModelPath.value)
    response = await window.videoAPI.tag({
      videoPath: videoPath.value,
      outputDir,
      mode: mode.value,
      fps: fps.value,
      count: count.value,
      percent: percent.value,
      modelPath: activeModelPath.value,
      csvPath: model?.csvPath ?? undefined,
    })
  } else {
    response = await window.videoAPI.extract({
      videoPath: videoPath.value,
      outputDir,
      mode: mode.value,
      fps: fps.value,
      count: count.value,
      percent: percent.value,
      frameIndexes: specificFrames.value.split(',').map(item => Number(item.trim())).filter(Number.isFinite),
      taskId: taskId.value,
    })
  }
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '抽帧失败'
    return
  }
  result.value = response.data.frames
  if (autoTag.value) {
    videoTags.value = response.data.tags
  } else {
    taggerStore.appendPaths(response.data.frames)
  }
  previews.value = []
  for (const path of response.data.frames.slice(0, 6)) {
    const thumb = await window.fsAPI.readThumb(path)
    if (thumb.success && thumb.base64) previews.value.push(`data:image/jpeg;base64,${thumb.base64}`)
  }
}

function cancel() {
  if (taskId.value) void window.videoAPI.cancel(taskId.value)
}

function updateEstimate() {
  if (!info.value) return
  const total = Math.max(1, Math.round(info.value.duration * info.value.fps))
  if (mode.value === 'all' || mode.value === 'native') estimatedCount.value = total
  else if (mode.value === 'fps') estimatedCount.value = Math.max(1, Math.round(info.value.duration * fps.value))
  else if (mode.value === 'specific') estimatedCount.value = specificFrames.value.split(',').filter(item => item.trim()).length
  else if (mode.value === 'random') estimatedCount.value = Math.max(1, Math.round(total * percent.value / 100))
  else estimatedCount.value = count.value
}

onMounted(() => {
  void loadModels()
  window.videoAPI.onProgress((progress) => {
    if (progress.taskId === taskId.value) {
      progressText.value = progress.frame !== undefined ? `已处理 ${progress.frame} 帧` : (progress.time ? `处理到 ${progress.time}` : '处理中')
    }
  })
})

onUnmounted(() => {
  if (taskId.value) void window.videoAPI.cancel(taskId.value)
})
watch([mode, fps, count, percent, specificFrames], updateEstimate)
</script>

<template>
  <main class="video-extract">
    <header><h1>视频抽帧</h1><p>把视频拆成图片，自动导入标注队列</p></header>
    <section class="panel">
      <button @click="pickVideo">{{ videoPath || '选择视频' }}</button>
      <p v-if="info" class="video-info">{{ info.width }} × {{ info.height }} · {{ info.fps.toFixed(2) }} FPS · {{ info.duration.toFixed(1) }}s</p>
      <p v-if="estimatedCount" class="estimate">预计约 {{ estimatedCount }} 帧</p>
      <div class="fields">
        <select v-model="mode">
          <option value="all">全帧</option>
          <option value="native">原生 FPS</option>
          <option value="fps">按 FPS</option>
          <option value="specific">指定帧</option>
          <option value="random">随机</option>
          <option value="distributed">均匀分布</option>
          <option value="regional">区域随机</option>
        </select>
        <label v-if="mode === 'fps'">FPS <input v-model.number="fps" type="number" min="0.1" step="0.1" /></label>
        <label v-if="['distributed','regional'].includes(mode)">数量 <input v-model.number="count" type="number" min="1" /></label>
        <label v-if="mode === 'random'">百分比 <input v-model.number="percent" type="number" min="1" max="100" /></label>
        <label v-if="mode === 'specific'">帧号（逗号分隔）<input v-model="specificFrames" placeholder="10,20,30" /></label>
      </div>
      <div class="auto-tag">
        <label class="check"><input v-model="autoTag" type="checkbox" /> 抽帧后自动打标并汇总</label>
        <label v-if="autoTag">打标模型
          <select v-model="activeModelPath">
            <option v-for="model in models" :key="model.path" :value="model.path">{{ model.name }}</option>
          </select>
        </label>
      </div>
      <button class="primary" :disabled="!videoPath || busy" @click="start">{{ busy ? '处理中…' : '开始抽帧' }}</button>
      <button v-if="busy" @click="cancel">取消</button>
      <p v-if="progressText" class="progress">{{ progressText }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="result.length" class="results"><strong>已生成 {{ result.length }} 帧</strong><span>{{ autoTag ? '已自动打标并汇总' : '已加入标注队列' }}</span></div>
      <div v-if="videoTags.length" class="video-tags"><strong>视频标签汇总（按出现帧数排序）</strong><div><span v-for="tag in videoTags" :key="tag.tag">{{ tag.tag }} <small>{{ tag.count }}帧</small></span></div></div>
      <div v-if="previews.length" class="previews"><img v-for="src in previews" :key="src" :src="src" /></div>
    </section>
  </main>
</template>

<style scoped>
.video-extract { padding: 24px; color: var(--text-primary); }
h1 { margin: 0; font-size: 22px; }
p { color: var(--text-tertiary); }
.panel { max-width: 640px; margin-top: 20px; padding: 18px; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; background: rgba(255,255,255,.03); }
button { height: 34px; padding: 0 13px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.04); color: var(--text-secondary); cursor: pointer; }
button.primary { border-color: transparent; background: var(--accent-primary); color: white; }
.fields { display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0; }
label { display: grid; gap: 4px; color: var(--text-tertiary); font-size: 10px; }
input, select { height: 32px; padding: 0 8px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); }
.error { color: #ff9a86; }
.progress { margin-top: 10px; color: var(--text-tertiary); font-size: 10px; }
.video-info { margin: 12px 0 0; color: var(--text-secondary); font-size: 10px; }
.estimate { margin-top: 6px; color: var(--accent-primary); font-size: 10px; }
.results { display: grid; gap: 5px; margin-top: 14px; color: var(--text-tertiary); font-size: 10px; }
.previews { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.previews img { width: 92px; height: 92px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,.08); }
.auto-tag { display: grid; gap: 8px; margin: 4px 0 14px; }.auto-tag label { display: grid; gap: 5px; color: var(--text-tertiary); font-size: 10px; }.auto-tag .check { display: flex; align-items: center; gap: 7px; }.auto-tag .check input { width: auto; height: auto; }.video-tags { margin-top: 14px; padding: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 10px; background: rgba(255,255,255,.02); }.video-tags strong { display: block; margin-bottom: 9px; color: var(--text-secondary); font-size: 10px; }.video-tags div { display: flex; flex-wrap: wrap; gap: 6px; }.video-tags span { padding: 4px 7px; border-radius: 999px; background: rgba(var(--accent-primary-rgb),.08); color: var(--text-secondary); font-size: 9px; }.video-tags small { color: var(--text-tertiary); font-size: 8px; }
</style>

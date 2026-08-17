<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const videoPath = ref('')
const info = ref<VideoProbeInfo | null>(null)
const format = ref('mp4')
const codec = ref('copy')
const replaceOriginal = ref(false)
const busy = ref(false)
const result = ref('')
const error = ref('')
const taskId = ref('')
const progressText = ref('')

async function pickVideo() {
  if (!window.fsAPI) return
  const paths = await window.fsAPI.selectVideos()
  if (!paths?.length) return
  videoPath.value = paths[0]
  info.value = null
  const response = await window.videoAPI.probe(videoPath.value)
  if (response.success && response.data) info.value = response.data
}

async function convert() {
  if (!videoPath.value || !window.videoAPI) return
  busy.value = true
  error.value = ''
  result.value = ''
  const outputPath = replaceOriginal.value ? videoPath.value : videoPath.value.replace(/\.[^.]+$/, `.${format.value}`)
  taskId.value = `video_convert_${Date.now()}`
  progressText.value = ''
  const response = await window.videoAPI.convert?.({ videoPath: videoPath.value, outputPath, codec: codec.value, replaceOriginal: replaceOriginal.value, taskId: taskId.value })
  busy.value = false
  if (!response || !response.success) {
    error.value = response?.error || '转换失败'
    return
  }
  result.value = outputPath
}

function cancel() {
  if (taskId.value) void window.videoAPI.cancel(taskId.value)
}

onMounted(() => {
  window.videoAPI.onProgress((progress) => {
    if (progress.taskId === taskId.value) {
      progressText.value = progress.frame !== undefined ? `已处理 ${progress.frame} 帧` : (progress.time ? `处理到 ${progress.time}` : '处理中')
    }
  })
})

onUnmounted(() => { if (taskId.value) void window.videoAPI.cancel(taskId.value) })
</script>

<template>
  <main class="video-convert">
    <header><h1>视频格式转换</h1><p>把视频转换成其他格式</p></header>
    <section class="panel">
      <button @click="pickVideo">{{ videoPath || '选择视频' }}</button>
      <p v-if="info" class="video-info">{{ info.width }} × {{ info.height }} · {{ info.fps.toFixed(2) }} FPS · {{ info.duration.toFixed(1) }}s</p>
      <div class="fields">
        <label>输出格式<select v-model="format"><option v-for="f in ['mp4','mkv','avi','webm','mov','flv']" :key="f" :value="f">{{ f }}</option></select></label>
        <label>编码<select v-model="codec"><option value="copy">复制流</option><option value="h264">H.264</option><option value="h265">H.265</option></select></label>
        <label class="check"><input type="checkbox" v-model="replaceOriginal" /> 转换后替换原文件</label>
      </div>
      <button class="primary" :disabled="!videoPath || busy" @click="convert">{{ busy ? '处理中…' : '开始转换' }}</button>
      <button v-if="busy" @click="cancel">取消</button>
      <p v-if="progressText" class="progress">{{ progressText }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="result" class="result">已输出：{{ result }}</p>
    </section>
  </main>
</template>

<style scoped>
.video-convert { padding: 24px; color: var(--text-primary); }
h1 { margin: 0; font-size: 22px; }
p { color: var(--text-tertiary); }
.panel { max-width: 640px; margin-top: 20px; padding: 18px; border: 1px solid rgba(255,255,255,.08); border-radius: 14px; background: rgba(255,255,255,.03); }
button { height: 34px; padding: 0 13px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.04); color: var(--text-secondary); cursor: pointer; }
button.primary { border-color: transparent; background: var(--accent-primary); color: white; }
.fields { display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0; }
label { display: grid; gap: 4px; color: var(--text-tertiary); font-size: 10px; }
.check { display: flex; align-items: center; gap: 6px; }
select { height: 32px; padding: 0 8px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); }
.error { color: #ff9a86; }
.progress { margin-top: 10px; color: var(--text-tertiary); font-size: 10px; }
.video-info { margin: 12px 0 0; color: var(--text-secondary); font-size: 10px; }
.result { color: var(--text-secondary); }
</style>

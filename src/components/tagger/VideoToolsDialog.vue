<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ visible: boolean; videoPath: string | null }>()
const emit = defineEmits<{ close: []; frames: [paths: string[]] }>()

const mode = ref('all')
const fps = ref(1)
const count = ref(5)
const percent = ref(10)
const busy = ref(false)
const error = ref('')
const info = ref<VideoProbeInfo | null>(null)

async function loadInfo() {
  if (!props.videoPath || !window.videoAPI) return
  const response = await window.videoAPI.probe(props.videoPath)
  if (response.success && response.data) info.value = response.data
}

async function extract() {
  if (!props.videoPath || !window.videoAPI) return
  busy.value = true
  error.value = ''
  const outputDir = `${props.videoPath}_frames`
  const response = await window.videoAPI.extract({
    videoPath: props.videoPath,
    outputDir,
    mode: mode.value,
    fps: fps.value,
    count: count.value,
    percent: percent.value,
  })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '抽帧失败'
    return
  }
  emit('frames', response.data.frames)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog-card">
        <div><p>VIDEO TOOLS</p><h2>视频抽帧</h2></div>
        <div class="dialog-tabs">
          <button v-for="item in ['all','fps','specific','random','distributed','regional']" :key="item" :class="{ active: mode === item }" @click="mode = item">{{ item }}</button>
        </div>
        <div class="dialog-fields">
          <label v-if="mode === 'fps'">FPS<input v-model.number="fps" type="number" min="0.1" step="0.1" /></label>
          <label v-if="['distributed','regional'].includes(mode)">数量<input v-model.number="count" type="number" min="1" /></label>
          <label v-if="mode === 'random'">百分比<input v-model.number="percent" type="number" min="1" max="100" /></label>
        </div>
        <p v-if="info" class="video-info">{{ info.width }} × {{ info.height }} · {{ info.fps.toFixed(2) }} FPS · {{ info.duration.toFixed(1) }}s</p>
        <p v-if="error" class="operation-error">{{ error }}</p>
        <footer>
          <button @click="emit('close')">取消</button>
          <button :disabled="busy" @click="loadInfo">读取信息</button>
          <button class="primary" :disabled="busy" @click="extract">{{ busy ? '处理中…' : '开始抽帧' }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 720; display: grid; place-items: center; padding: 20px; background: rgba(7,6,9,.68); backdrop-filter: blur(9px); }
.dialog-card { width: min(520px, 100%); padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: #1c1921; box-shadow: 0 30px 80px rgba(0,0,0,.48); }
.dialog-card h2 { margin: 0; font-size: 19px; }
.dialog-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 20px 0 12px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,.03); }
.dialog-tabs button { height: 32px; border: 0; border-radius: 7px; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.dialog-tabs button.active { background: rgba(var(--accent-primary-rgb),.12); color: var(--accent-primary); }
.dialog-fields { display: grid; gap: 13px; }
.dialog-fields label { display: grid; gap: 6px; color: var(--text-tertiary); font-size: 9px; }
.dialog-fields input { box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; }
.video-info { margin: 12px 0 0; color: var(--text-secondary); font-size: 9px; }
.operation-error { margin: 10px 0 0; color: #ff9a86; font-size: 9px; }
.dialog-card footer { display: flex; justify-content: flex-end; gap: 7px; margin-top: 20px; }
.dialog-card footer button { height: 34px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; }
.dialog-card footer .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
</style>

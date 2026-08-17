<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
const ffmpegDir = ref('')

async function chooseFfmpegDir() {
  if (!window.fsAPI) return
  const dir = await window.fsAPI.selectFolder()
  if (!dir) return
  ffmpegDir.value = dir
  await window.videoAPI.setFfmpegDir(dir)
}
</script>

<template>
  <main class="video-hub">
    <header><h1>视频</h1><p>选择你要进行的视频操作</p></header>
    <button class="ffmpeg" @click="chooseFfmpegDir">{{ ffmpegDir || '设置 FFmpeg 目录' }}</button>
    <section class="cards">
      <button @click="router.push('/video/convert')"><strong>视频格式转换</strong><span>mp4 / mkv / avi / webm / mov / flv</span></button>
      <button @click="router.push('/video/extract')"><strong>视频抽帧</strong><span>全帧 / FPS / 随机 / 区域</span></button>
    </section>
  </main>
</template>

<style scoped>
.video-hub { padding: 28px; color: var(--text-primary); }
h1 { margin: 0; font-size: 24px; }
p { color: var(--text-tertiary); }
.cards { display: grid; grid-template-columns: repeat(2, minmax(220px, 320px)); gap: 14px; margin-top: 26px; }
button { display: grid; gap: 8px; min-height: 120px; padding: 20px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: rgba(255,255,255,.04); color: var(--text-primary); cursor: pointer; text-align: left; }
button:hover { border-color: rgba(var(--accent-primary-rgb),.45); background: rgba(var(--accent-primary-rgb),.07); }
.ffmpeg { margin-top: 14px; min-height: 38px; display: inline-flex; align-items: center; padding: 0 14px; }
strong { font-size: 17px; }
span { color: var(--text-tertiary); font-size: 11px; }
</style>

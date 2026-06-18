import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PipelineTask {
  name: string
  progress: number   // 0-100
  eta: string        // like "12s"
  speed: string      // like "2.3 it/s"
}

export const usePipelineStore = defineStore('pipeline', () => {
  const currentTask = ref<PipelineTask | null>(null)

  function startTask(name: string) {
    currentTask.value = { name, progress: 0, eta: '计算中...', speed: '-' }
  }

  function updateProgress(progress: number, eta: string, speed: string) {
    if (!currentTask.value) return
    currentTask.value.progress = progress
    currentTask.value.eta = eta
    currentTask.value.speed = speed
  }

  function finishTask() {
    currentTask.value = null
  }

  return { currentTask, startTask, updateProgress, finishTask }
})

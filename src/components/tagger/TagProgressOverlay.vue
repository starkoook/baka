<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  completed: number
  total: number
  currentFile: string
  provider: string
  taskId: string
}>()

const emit = defineEmits<{ cancel: [] }>()

const percent = computed(() => {
  if (props.total === 0) return 0
  return Math.round((props.completed / props.total) * 100)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="tpo-overlay">
      <div class="tpo-card">
        <div class="tpo-header">
          <span class="tpo-title">🔮 标注进行中</span>
          <span class="tpo-provider" v-if="provider">{{ provider.toUpperCase() }}</span>
        </div>
        <div class="tpo-bar-track">
          <div class="tpo-bar-fill" :style="{ width: percent + '%' }"></div>
        </div>
        <div class="tpo-stats">
          <span>{{ completed }} / {{ total }}</span>
          <span>{{ percent }}%</span>
        </div>
        <div class="tpo-file" :title="currentFile">{{ currentFile || '准备中...' }}</div>
        <button class="tpo-cancel" @click="emit('cancel')">取消</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tpo-overlay {
  position: fixed; bottom: 24px; right: 24px; z-index: 999;
  pointer-events: none;
}
.tpo-card {
  background: #18181a; border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; padding: 18px 22px;
  width: 320px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  pointer-events: auto;
}
.tpo-header { display: flex; justify-content: space-between; margin-bottom: 12px; }
.tpo-title { font-size: 13px; font-weight: 600; color: #e5e7eb; }
.tpo-provider { font-size: 10px; color: #ff69b4; padding: 2px 8px; background: rgba(255,105,180,0.1); border-radius: 4px; }
.tpo-bar-track { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-bottom: 10px; }
.tpo-bar-fill { height: 100%; background: linear-gradient(90deg, #ff69b4, #ff85c2); border-radius: 2px; transition: width 0.3s; }
.tpo-stats { display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; margin-bottom: 6px; }
.tpo-file { font-size: 10px; color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 10px; }
.tpo-cancel { width: 100%; padding: 7px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; color: #6b7280; font-size: 11px; cursor: pointer; }
.tpo-cancel:hover { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.2); color: #ef4444; }
</style>

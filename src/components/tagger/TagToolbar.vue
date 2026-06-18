<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  selectedCount: number
  isProcessing: boolean
}>()

const emit = defineEmits<{
  tagSelected: []
  selectModelDir: []
  refresh: []
}>()

const models = ref<ModelInfo[]>([])
const providers = ref<string[]>([])
const activeModel = ref('')
const tagSource = ref<'local' | 'llm'>('local')
const threshold = ref(0.35)

async function loadModels() {
  if (!window.taggerV2API) return
  const res = await window.taggerV2API.listModels()
  if (res.success && res.data) {
    models.value = res.data.models
    providers.value = res.data.providers
    if (models.value.length > 0 && !activeModel.value) {
      activeModel.value = models.value[0].path
    }
  }
}

function handleModelSelect(path: string) {
  activeModel.value = path
}

const qualityLabel: Record<string, string> = { high: '⚡', medium: '◆', low: '◇', unknown: '?' }
const qualityColor: Record<string, string> = { high: '#22c55e', medium: '#f59e0b', low: '#6b7280', unknown: '#6b7280' }

onMounted(loadModels)
</script>

<template>
  <div class="tt-bar">
    <div class="tt-left">
      <!-- Model selector -->
      <div class="tt-model-area">
        <span class="tt-label">MODEL</span>
        <div v-if="models.length === 0" class="tt-no-models">
          <span class="tt-no-icon">⚠</span>
          <button class="tt-link" @click="emit('selectModelDir')">设置模型目录</button>
        </div>
        <select v-else class="tt-select" :value="activeModel" @change="handleModelSelect(($event.target as HTMLSelectElement).value)">
          <option v-for="m in models" :key="m.path" :value="m.path">
            {{ qualityLabel[m.quality] || '' }} {{ m.name }} ({{ m.speed }})
          </option>
        </select>
        <button class="tt-icon-btn" @click="emit('selectModelDir')" title="模型目录">📁</button>
        <button class="tt-icon-btn" @click="loadModels" title="刷新">↻</button>
      </div>

      <!-- Source toggle -->
      <div class="tt-source">
        <button :class="{ active: tagSource === 'local' }" @click="tagSource = 'local'">本地</button>
        <button :class="{ active: tagSource === 'llm' }" @click="tagSource = 'llm'">LLM</button>
      </div>

      <!-- Threshold -->
      <div class="tt-threshold">
        <span class="tt-label">TH</span>
        <input type="range" min="0.1" max="0.9" step="0.05" v-model.number="threshold" class="tt-slider" />
        <span class="tt-val">{{ threshold.toFixed(2) }}</span>
      </div>
    </div>

    <div class="tt-right">
      <!-- Provider info -->
      <span v-if="providers.length > 0" class="tt-providers">
        {{ providers.filter(p => p !== 'cpu').join(' · ') || 'CPU' }}
      </span>

      <!-- Action buttons -->
      <button class="tt-action" :disabled="selectedCount === 0 || isProcessing" @click="emit('tagSelected')">
        🏷 标注{{ selectedCount > 0 ? ` (${selectedCount})` : '' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.tt-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; gap: 16px;
  background: linear-gradient(135deg, rgba(255,105,180,0.08) 0%, rgba(30,30,32,0.95) 50%);
  border: 1px solid rgba(255,105,180,0.15);
  border-radius: var(--radius-md); flex-shrink: 0; flex-wrap: wrap;
}
.tt-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.tt-right { display: flex; align-items: center; gap: 12px; }

.tt-model-area { display: flex; align-items: center; gap: 8px; }
.tt-label { font-size: 9px; font-weight: 700; color: #ff69b4; letter-spacing: 0.06em; }
.tt-no-models { display: flex; align-items: center; gap: 8px; padding: 4px 10px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,105,180,0.2); border-radius: 6px; }
.tt-no-icon { font-size: 14px; }
.tt-link { background: none; border: none; color: #ff69b4; cursor: pointer; font-size: 12px; text-decoration: underline; font-weight: 600; }
.tt-select { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #e5e7eb; font-size: 12px; padding: 6px 10px; border-radius: 6px; max-width: 240px; }
.tt-icon-btn { background: none; border: none; color: #6b7280; cursor: pointer; font-size: 15px; padding: 3px 5px; }
.tt-icon-btn:hover { color: #ff69b4; }

.tt-source { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,105,180,0.15); }
.tt-source button { background: none; border: none; color: #9ca3af; padding: 6px 12px; font-size: 11px; cursor: pointer; transition: all 0.2s; }
.tt-source button.active { background: rgba(255,105,180,0.2); color: #ff69b4; font-weight: 600; }

.tt-threshold { display: flex; align-items: center; gap: 6px; }
.tt-slider { width: 80px; accent-color: #ff69b4; }
.tt-val { font-size: 12px; color: #d1d5db; font-family: monospace; width: 36px; }

.tt-providers { font-size: 10px; color: #22c55e; padding: 2px 8px; background: rgba(34,197,94,0.1); border-radius: 4px; font-weight: 500; }

.tt-action {
  padding: 10px 22px;
  background: linear-gradient(135deg, #ff69b4, #ff85c2);
  border: none; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 700;
  cursor: pointer; white-space: nowrap;
  box-shadow: 0 2px 12px rgba(255,105,180,0.3);
  transition: all 0.2s;
}
.tt-action:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
.tt-action:not(:disabled):hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(255,105,180,0.4); }
</style>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

const emit = defineEmits<{ apply: [config: any]; close: [] }>()

const models = ref<ModelInfo[]>([])
const providers = ref<string[]>([])
const activeModelPath = ref('')
const tagSource = ref<'local' | 'llm'>('local')
const threshold = ref(0.35)
const charThreshold = ref(0.85)
const maxTags = ref(50)
const batchSize = ref(4)
const useGpu = ref(true)
const modelDir = ref('')
const dragOver = ref(false)
const showAdvanced = ref(false)

// LLM
const llmProvider = ref('openai'); const llmModel = ref('gpt-4o')
const llmBaseUrl = ref(''); const llmApiKey = ref('')

const activeModel = computed(() => models.value.find(m => m.path === activeModelPath.value))

const qualityStars = (q: string) => ({ high: 3, medium: 2, low: 1, unknown: 0 }[q] || 0)
const qualityLabel: Record<string,string> = { high: '高精度', medium: '均衡', low: '快速', unknown: '未知' }
const speedLabel: Record<string,string> = { fast: '快速', normal: '正常', slow: '较慢' }

async function loadModels() {
  if (!window.taggerV2API) return
  const dirRes = await window.taggerV2API.getModelDir()
  if (dirRes.success) modelDir.value = dirRes.data!.dir
  const res = await window.taggerV2API.listModels()
  if (res.success && res.data) {
    models.value = res.data.models
    providers.value = res.data.providers
    if (models.value.length > 0 && !activeModelPath.value) {
      activeModelPath.value = models.value[0].path
      const m = models.value[0]
      threshold.value = m.defaultThreshold || 0.35
      charThreshold.value = m.characterThreshold || 0.85
      maxTags.value = m.maxTags || 50
    }
  }
  if (window.llmAPI) {
    const cfg = await window.llmAPI.getConfig()
    if (cfg) { llmProvider.value = cfg.provider || 'openai'; llmModel.value = cfg.model || 'gpt-4o'; llmBaseUrl.value = cfg.baseUrl || ''; llmApiKey.value = cfg.apiKey || '' }
  }
}

function selectModel(path: string) {
  activeModelPath.value = path
  const m = models.value.find(x => x.path === path)
  if (m) {
    threshold.value = m.defaultThreshold || 0.35
    charThreshold.value = m.characterThreshold || 0.85
    maxTags.value = m.maxTags || 50
  }
}

async function handleOpenModelDir() { if (window.taggerV2API) await window.taggerV2API.openModelDir() }
function onDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDragLeave() { dragOver.value = false }
async function onDrop(e: DragEvent) {
  e.preventDefault(); dragOver.value = false
  if (!window.taggerV2API) return
  const file = e.dataTransfer?.files?.[0]; if (!file) return
  const fp = window.galleryAPI?.getFilePath(file) || (file as any).path; if (!fp) return
  const ext = fp.toLowerCase().split('.').pop(); if (!ext || !['onnx','csv'].includes(ext)) return
  const res = await window.taggerV2API.importModel(fp)
  if (res.success && res.data) { models.value = res.data.models; if (models.value.length > 0 && !activeModelPath.value) selectModel(models.value[0].path) }
}

function apply() {
  emit('apply', {
    tagSource: tagSource.value, threshold: threshold.value, characterThreshold: charThreshold.value,
    maxTags: maxTags.value, batchSize: batchSize.value, useGpu: useGpu.value,
    localModel: activeModel.value,
    llm: { provider: llmProvider.value, model: llmModel.value, baseUrl: llmBaseUrl.value, apiKey: llmApiKey.value },
  })
}

onMounted(loadModels)
</script>

<template>
  <div class="tsp-root">
    <div class="tsp-hd">
      <h2>标注设置</h2>
      <button @click="emit('close')">✕</button>
    </div>

    <!-- Source tabs -->
    <div class="tsp-src">
      <button :class="{ on: tagSource === 'local' }" @click="tagSource = 'local'">🖥 本地 ONNX</button>
      <button :class="{ on: tagSource === 'llm' }" @click="tagSource = 'llm'">☁ 云端 LLM</button>
    </div>

    <!-- ── LOCAL ── -->
    <div v-if="tagSource === 'local'" class="tsp-body">
      <!-- Drop zone -->
      <div class="tsp-drop" :class="{ over: dragOver }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
        <span class="tsp-drop-icon">📁</span>
        <span>拖入 .onnx / .csv 文件</span>
        <span class="tsp-drop-dir" @click="handleOpenModelDir">{{ modelDir || '加载中...' }}</span>
      </div>

      <!-- Model cards -->
      <div class="tsp-models" v-if="models.length > 0">
        <div v-for="m in models" :key="m.path" class="tsp-mcard" :class="{ sel: activeModelPath === m.path }" @click="selectModel(m.path)">
          <div class="tsp-mcard-hd">
            <span class="tsp-mcard-name">{{ m.name }}</span>
            <span class="tsp-mcard-check" v-if="activeModelPath === m.path">✓</span>
          </div>
          <div class="tsp-mcard-meta">
            <span class="tsp-stars">
              <template v-for="i in 3">★</template>
              <template v-for="i in (3 - qualityStars(m.quality))">☆</template>
            </span>
            <span>{{ qualityLabel[m.quality] || m.quality }}</span>
            <span class="tsp-dot">·</span>
            <span>{{ speedLabel[m.speed] || m.speed }}</span>
          </div>
          <div class="tsp-mcard-info">
            <span>{{ m.resolution }}px</span>
            <span>~{{ m.memoryMb }}MB</span>
            <span>阈 {{ m.defaultThreshold }}</span>
          </div>
        </div>
      </div>
      <div v-else class="tsp-empty">未发现 ONNX 模型</div>

      <!-- Params -->
      <div class="tsp-params">
        <div class="tsp-param">
          <label>通用阈值 <em>{{ threshold.toFixed(2) }}</em></label>
          <input type="range" min="0.05" max="0.95" step="0.01" v-model.number="threshold" />
        </div>
        <div class="tsp-param">
          <label>角色阈值 <em>{{ charThreshold.toFixed(2) }}</em></label>
          <input type="range" min="0.5" max="0.99" step="0.01" v-model.number="charThreshold" />
          <span class="tsp-hint">角色标签需要更高置信度避免误判</span>
        </div>
        <div class="tsp-param">
          <label>最大标签数 <em>{{ maxTags }}</em></label>
          <input type="number" min="5" max="200" step="5" v-model.number="maxTags" />
        </div>

        <!-- Advanced toggle -->
        <button class="tsp-adv-btn" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '▾' : '▸' }} 高级选项
        </button>
        <div v-if="showAdvanced" class="tsp-advanced">
          <div class="tsp-param">
            <label>批量大小 <em>{{ batchSize }}</em></label>
            <select v-model.number="batchSize">
              <option v-for="n in [1,2,4,6,8,12,16,24,32]" :key="n" :value="n">{{ n }}</option>
            </select>
            <span class="tsp-hint">大 = 更快但更多显存</span>
          </div>
          <div class="tsp-param">
            <label>使用 GPU</label>
            <input type="checkbox" v-model="useGpu" />
            <span class="tsp-hint">{{ providers.filter(p => p !== 'cpu').join(', ') || '未检测到 GPU' }}</span>
          </div>
          <div class="tsp-param" v-if="activeModel">
            <label>模型信息</label>
            <div class="tsp-model-detail">
              <span>布局: {{ activeModel.inputLayout?.toUpperCase() }}</span>
              <span>归一化: {{ activeModel.normalization }}</span>
              <span>激活: {{ activeModel.outputActivation }}</span>
              <span>缩放: {{ activeModel.resizeMode }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── LLM ── -->
    <div v-if="tagSource === 'llm'" class="tsp-body">
      <div class="tsp-param">
        <label>提供商</label>
        <select v-model="llmProvider">
          <option value="openai">OpenAI 兼容</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </div>
      <div class="tsp-param">
        <label>模型</label>
        <input v-model="llmModel" placeholder="gpt-4o" />
      </div>
      <div class="tsp-param">
        <label>API 地址</label>
        <input v-model="llmBaseUrl" :placeholder="llmProvider === 'openai' ? 'https://api.openai.com/v1' : ''" />
      </div>
      <div class="tsp-param">
        <label>API 密钥</label>
        <input v-model="llmApiKey" type="password" placeholder="sk-..." />
      </div>
    </div>

    <button class="tsp-apply" @click="apply">应用设置</button>
  </div>
</template>

<style scoped>
.tsp-root { background: #18181a; border: 1px solid rgba(255,105,180,0.08); border-radius: 14px; padding: 18px; width: 380px; max-height: 85vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.tsp-hd { display: flex; justify-content: space-between; align-items: center; }
.tsp-hd h2 { font-size: 16px; font-weight: 700; color: #f3f4f6; margin: 0; }
.tsp-hd button { background: none; border: none; color: #6b7280; font-size: 16px; cursor: pointer; }
.tsp-src { display: flex; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06); }
.tsp-src button { flex: 1; padding: 8px; border: none; background: none; color: #6b7280; font-size: 12px; cursor: pointer; }
.tsp-src button.on { background: rgba(255,105,180,0.12); color: #ff69b4; font-weight: 600; }

.tsp-body { display: flex; flex-direction: column; gap: 10px; }
.tsp-drop { border: 2px dashed rgba(255,255,255,0.06); border-radius: 10px; padding: 12px; text-align: center; font-size: 11px; color: #6b7280; transition: all 0.2s; cursor: default; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.tsp-drop.over { border-color: #ff69b4; background: rgba(255,105,180,0.04); }
.tsp-drop-icon { font-size: 24px; }
.tsp-drop-dir { font-size: 9px; color: #4b5563; font-family: monospace; cursor: pointer; text-decoration: underline; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tsp-models { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
.tsp-mcard {
  background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 12px;
  cursor: pointer; transition: all 0.15s;
}
.tsp-mcard:hover { border-color: rgba(255,255,255,0.1); }
.tsp-mcard.sel { border-color: rgba(255,105,180,0.3); background: rgba(255,105,180,0.04); }
.tsp-mcard-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.tsp-mcard-name { font-size: 13px; font-weight: 600; color: #e5e7eb; font-family: monospace; }
.tsp-mcard-check { color: #ff69b4; font-weight: 700; }
.tsp-mcard-meta { font-size: 10px; color: #9ca3af; margin-bottom: 4px; display: flex; align-items: center; gap: 4px; }
.tsp-stars { color: #f59e0b; letter-spacing: 1px; }
.tsp-dot { color: #4b5563; }
.tsp-mcard-info { display: flex; gap: 10px; font-size: 9px; color: #6b7280; }

.tsp-empty { text-align: center; padding: 20px; font-size: 12px; color: #4b5563; }
.tsp-params { display: flex; flex-direction: column; gap: 10px; }
.tsp-param { display: flex; flex-direction: column; gap: 4px; }
.tsp-param label { font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; display: flex; justify-content: space-between; }
.tsp-param em { font-style: normal; color: #ff69b4; font-weight: 700; font-family: monospace; }
.tsp-param input[type=range] { width: 100%; accent-color: #ff69b4; }
.tsp-param input[type=number], .tsp-param select, .tsp-param input[type=text], .tsp-param input[type=password] { width: 100%; padding: 7px 10px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #e5e7eb; font-size: 12px; box-sizing: border-box; }
.tsp-param input:focus, .tsp-param select:focus { outline: none; border-color: rgba(255,105,180,0.3); }
.tsp-hint { font-size: 9px; color: #4b5563; }
.tsp-adv-btn { background: none; border: 1px solid rgba(255,255,255,0.04); color: #6b7280; font-size: 11px; padding: 6px; border-radius: 6px; cursor: pointer; width: 100%; }
.tsp-adv-btn:hover { color: #ff69b4; }
.tsp-advanced { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
.tsp-model-detail { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; color: #6b7280; font-family: monospace; }

.tsp-apply { padding: 10px; border: none; border-radius: 8px; background: linear-gradient(135deg, #ff69b4, #ff85c2); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; }
.tsp-apply:hover { filter: brightness(1.1); }
</style>

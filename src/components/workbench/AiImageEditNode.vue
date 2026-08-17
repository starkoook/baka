<script setup lang="ts">
interface ApiOption { id: string; name: string }

const props = defineProps<{
  sourceReady: boolean
  apiConfigs: ApiOption[]
  apiConfigId?: string
  model?: string
  models: string[]
  editPrompt?: string
  outputSize?: string
  maskImageBase64?: string
  result?: string
  running?: boolean
  engineMode?: 'cloud' | 'local'
  engineProfileId?: string
  engineProfiles: LocalEngineProfile[]
}>()

const emit = defineEmits<{
  'update:apiConfigId': [value: string]
  'update:model': [value: string]
  'update:editPrompt': [value: string]
  'update:outputSize': [value: string]
  'update:maskImageBase64': [value: string]
  chooseMask: []
  touch: [field: 'model' | 'editPrompt' | 'outputSize']
  loadModels: []
  run: []
  'update:engineMode': [value: 'cloud' | 'local']
  'update:engineProfileId': [value: string]
  configureEngine: []
}>()

function updateConfig(event: Event) {
  emit('update:apiConfigId', (event.target as HTMLSelectElement).value)
  emit('loadModels')
}

function updateEngineProfile(event: Event) {
  emit('update:engineProfileId', (event.target as HTMLSelectElement).value)
  emit('loadModels')
}
</script>

<template>
  <section class="ai-image-edit" @pointerdown.stop>
    <p v-if="!sourceReady" class="ai-image-edit__hint">先把“加载图片”节点连到左侧输入口</p>
    <label>
      <span>运行方式</span>
      <select :value="engineMode || 'cloud'" @change="emit('update:engineMode', ($event.target as HTMLSelectElement).value as 'cloud' | 'local')">
        <option value="cloud">云端 API</option>
        <option value="local">本地引擎</option>
      </select>
    </label>
    <label v-if="engineMode === 'local'">
      <span>本地引擎</span>
      <select :value="engineProfileId || ''" @change="updateEngineProfile">
        <option value="">（请选择）</option>
        <option v-for="profile in engineProfiles" :key="profile.id" :value="profile.id">{{ profile.type === 'comfy' ? 'ComfyUI' : 'WebUI / Forge' }} · {{ profile.name }}</option>
      </select>
      <button v-if="!engineProfiles.length" type="button" class="ai-image-edit__configure" @click="emit('configureEngine')">配置本地引擎</button>
    </label>
    <label v-if="engineMode !== 'local'">
      <span>API 配置</span>
      <select :value="apiConfigId || ''" @change="updateConfig">
        <option value="">（未选择）</option>
        <option v-for="cfg in apiConfigs" :key="cfg.id" :value="cfg.id">{{ cfg.name }}</option>
      </select>
    </label>
    <label>
      <span>模型</span>
      <select :value="model || ''" @change="emit('touch', 'model'); emit('update:model', ($event.target as HTMLSelectElement).value)">
        <option value="">（使用默认模型）</option>
        <option v-for="item in models" :key="item" :value="item">{{ item }}</option>
      </select>
    </label>
    <label>
      <span>编辑要求</span>
      <textarea
        :value="editPrompt || ''"
        placeholder="例如：把背景改成樱花飘落的夜景"
        @wheel.stop
        @input="emit('touch', 'editPrompt'); emit('update:editPrompt', ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </label>
    <label>
      <span>输出尺寸</span>
      <select :value="outputSize || '1024x1024'" @change="emit('touch', 'outputSize'); emit('update:outputSize', ($event.target as HTMLSelectElement).value)">
        <option value="1024x1024">1:1 · 1024×1024</option>
        <option value="1536x1024">横图 · 1536×1024</option>
        <option value="1024x1536">竖图 · 1024×1536</option>
      </select>
    </label>
    <label>
      <span>遮罩图片（可选）</span>
      <div class="ai-image-edit__mask">
        <button type="button" @click="emit('chooseMask')">{{ maskImageBase64 ? '更换遮罩' : '选择遮罩' }}</button>
        <button v-if="maskImageBase64" type="button" @click="emit('update:maskImageBase64', '')">清除</button>
      </div>
      <small>局部重绘需要一张黑白遮罩图，白色区域会被重绘。</small>
    </label>
    <button type="button" class="ai-image-edit__run" :disabled="running || !sourceReady" @click="emit('run')">
      {{ running ? '编辑中…' : '开始编辑' }}
    </button>
    <div class="ai-image-edit__result">
      <span>结果预览</span>
      <img v-if="result" :src="result" alt="AI 图片编辑结果" draggable="false" />
      <small v-else>编辑完成后显示在这里</small>
    </div>
  </section>
</template>

<style scoped>
.ai-image-edit { display: grid; gap: 8px; height: 100%; padding: 8px; box-sizing: border-box; overflow: auto; }
.ai-image-edit__hint { margin: 0; padding: 7px; border-radius: 7px; background: rgba(240,139,192,.1); color: #f2acd1; font-size: 11px; }
.ai-image-edit label { display: grid; gap: 4px; font-size: 11px; opacity: .78; }
.ai-image-edit select, .ai-image-edit textarea { width: 100%; box-sizing: border-box; border: 1px solid rgba(255,255,255,.13); border-radius: 6px; background: rgba(14,13,18,.82); color: inherit; padding: 6px; }
.ai-image-edit textarea { min-height: 64px; resize: vertical; }
.ai-image-edit__mask { display: flex; gap: 5px; }.ai-image-edit__mask button { flex: 1; border: 1px solid rgba(255,255,255,.13); border-radius: 6px; background: transparent; color: inherit; padding: 5px; cursor: pointer; }
.ai-image-edit label small { opacity: .62; font-size: 10px; }
.ai-image-edit__run { border: 0; border-radius: 7px; padding: 8px; background: var(--accent, #e878b3); color: #181117; font-weight: 700; cursor: pointer; }
.ai-image-edit__configure { border: 1px solid rgba(255,255,255,.13); border-radius: 6px; background: transparent; color: inherit; padding: 5px; cursor: pointer; }
.ai-image-edit__run:disabled { opacity: .45; cursor: default; }
.ai-image-edit__result { display: grid; gap: 5px; font-size: 11px; opacity: .72; }
.ai-image-edit__result img { width: 100%; max-height: 155px; object-fit: contain; border-radius: 7px; background: #15141a; }
.ai-image-edit__result small { min-height: 50px; display: grid; place-items: center; border: 1px dashed rgba(255,255,255,.12); border-radius: 7px; }
</style>

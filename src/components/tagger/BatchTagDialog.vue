<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ visible: boolean; imageIds: number[] }>()
const emit = defineEmits<{ close: []; applied: [] }>()

const operation = ref<'add' | 'remove' | 'replace' | 'cleanup'>('add')
const tags = ref('')
const replaceWith = ref('')
const previewCount = ref(0)
const previewText = ref('')
const busy = ref(false)
const error = ref('')

async function preview() {
  if (!window.taggerV2API || props.imageIds.length === 0) return
  busy.value = true
  error.value = ''
  const response = await window.taggerV2API.bulkDryRun(props.imageIds, {
    type: operation.value,
    tags: tags.value.split(',').map(tag => tag.trim()).filter(Boolean),
    replaceWith: replaceWith.value,
    useRegex: false,
  })
  busy.value = false
  if (!response.success || !response.data) {
    error.value = response.error || '预览失败'
    return
  }
  previewCount.value = response.data.previews.length
  previewText.value = response.data.previews
    .map(item => `${item.imageId}: ${item.before.join(', ')} -> ${item.after.join(', ')}`)
    .join('\n')
}

async function apply() {
  if (!window.taggerV2API || props.imageIds.length === 0) return
  busy.value = true
  error.value = ''
  const response = await window.taggerV2API.bulkApply(props.imageIds, {
    type: operation.value,
    tags: tags.value.split(',').map(tag => tag.trim()).filter(Boolean),
    replaceWith: replaceWith.value,
    useRegex: false,
  })
  busy.value = false
  if (!response.success) {
    error.value = response.error || '批量修改失败'
    return
  }
  emit('applied')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @click.self="emit('close')">
      <section class="dialog-card">
        <div><p>BATCH TAG</p><h2>批量改标签</h2></div>
        <div class="dialog-tabs">
          <button :class="{ active: operation === 'add' }" @click="operation = 'add'">添加</button>
          <button :class="{ active: operation === 'remove' }" @click="operation = 'remove'">删除</button>
          <button :class="{ active: operation === 'replace' }" @click="operation = 'replace'">替换</button>
          <button :class="{ active: operation === 'cleanup' }" @click="operation = 'cleanup'">清理</button>
        </div>
        <div class="dialog-fields">
          <label>标签（多个用逗号分隔）<input v-model="tags" placeholder="blue_hair, long_hair" /></label>
          <label v-if="operation === 'replace'">替换为<input v-model="replaceWith" placeholder="aqua_hair" /></label>
        </div>
        <pre v-if="previewText" class="preview-text">{{ previewText }}</pre>
        <p v-if="error" class="operation-error">{{ error }}</p>
        <footer>
          <button @click="emit('close')">取消</button>
          <button :disabled="busy" @click="preview">{{ busy ? '处理中…' : `预览 ${imageIds.length} 张` }}</button>
          <button class="primary" :disabled="busy || previewCount === 0" @click="apply">确认修改</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; padding: 20px; background: rgba(7,6,9,.68); backdrop-filter: blur(9px); }
.dialog-card { width: min(520px, 100%); padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: #1c1921; box-shadow: 0 30px 80px rgba(0,0,0,.48); }
.dialog-card h2 { margin: 0; font-size: 19px; }
.dialog-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 20px 0 12px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,.03); }
.dialog-tabs button { height: 32px; border: 0; border-radius: 7px; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.dialog-tabs button.active { background: rgba(var(--accent-primary-rgb),.12); color: var(--accent-primary); }
.dialog-fields { display: grid; gap: 13px; }
.dialog-fields label { display: grid; gap: 6px; color: var(--text-tertiary); font-size: 9px; }
.dialog-fields input { box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; }
.preview-text { max-height: 220px; overflow: auto; margin: 15px 0 0; padding: 10px; border-radius: 8px; background: rgba(0,0,0,.18); color: var(--text-tertiary); font: 8px/1.6 ui-monospace, monospace; white-space: pre-wrap; }
.operation-error { margin: 10px 0 0; color: #ff9a86; font-size: 9px; }
.dialog-card footer { display: flex; justify-content: flex-end; gap: 7px; margin-top: 20px; }
.dialog-card footer button { height: 34px; padding: 0 14px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; }
.dialog-card footer .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
</style>

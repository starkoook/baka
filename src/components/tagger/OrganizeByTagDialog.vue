<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  count: number
  availableTags: string[]
}>()

const emit = defineEmits<{
  close: []
  organize: [params: { tags: string[]; destFolder: string; keepOriginal: boolean }]
}>()

const tagText = ref('')
const destFolder = ref('')
const keepOriginal = ref(true)
const busy = ref(false)
const error = ref('')

const parsedTags = computed(() => [...new Set(tagText.value.split(/[，,]+/).map((tag) => tag.trim()).filter(Boolean))])

watch(() => props.visible, (visible) => {
  if (visible) {
    tagText.value = ''
    destFolder.value = ''
    keepOriginal.value = true
    busy.value = false
    error.value = ''
  }
})

async function chooseFolder() {
  destFolder.value = await window.fsAPI.selectFolder() || ''
}

function addSuggested(tag: string) {
  const current = new Set(parsedTags.value)
  current.add(tag)
  tagText.value = [...current].join(', ')
}

async function confirm() {
  if (parsedTags.value.length === 0) { error.value = '请至少填写一个归集标签。'; return }
  if (!destFolder.value) { error.value = '请选择目标文件夹。'; return }
  busy.value = true
  emit('organize', { tags: parsedTags.value, destFolder: destFolder.value, keepOriginal: keepOriginal.value })
}

function setBusy(value: boolean) { busy.value = value }
function setError(message: string) { error.value = message; busy.value = false }
defineExpose({ setBusy, setError })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-backdrop" @click.self="!busy && emit('close')">
      <section class="dialog-card organize-card">
        <div><p>ORGANIZE BY TAG</p><h2>按标签归集 {{ count }} 张图片</h2></div>
        <p class="intro">每个标签会建一个同名子文件夹，把含该标签的图片归进去。</p>

        <label class="field">
          <span>归集标签（多个用逗号分隔）</span>
          <input v-model="tagText" placeholder="例如：1girl, hatsune_miku" />
        </label>
        <div v-if="availableTags.length" class="suggestions">
          <span>从选中图片提取：</span>
          <button v-for="tag in availableTags.slice(0, 12)" :key="tag" @click="addSuggested(tag)">{{ tag }}</button>
        </div>

        <label class="field">
          <span>目标文件夹</span>
          <button class="folder-picker" @click="chooseFolder">{{ destFolder || '选择文件夹' }}</button>
        </label>

        <div class="operation-options">
          <button :class="{ active: keepOriginal }" @click="keepOriginal = true"><strong>复制</strong><span>保留原图，并复制同名 caption</span></button>
          <button :class="{ active: !keepOriginal }" @click="keepOriginal = false"><strong>移动</strong><span>更新图库和未完成标注任务中的路径</span></button>
        </div>

        <p v-if="error" class="operation-error">{{ error }}</p>
        <footer><button :disabled="busy" @click="emit('close')">取消</button><button class="primary" :disabled="busy" @click="confirm">{{ busy ? '处理中…' : '开始归集' }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-backdrop { position: fixed; inset: 0; z-index: 520; display: grid; place-items: center; padding: 20px; background: rgba(7,6,9,.68); backdrop-filter: blur(9px); }
.organize-card { width: min(520px, 100%); padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: #1c1921; box-shadow: 0 30px 80px rgba(0,0,0,.48); color: var(--text-primary); }
.organize-card p { color: var(--accent-primary); font-size: 7px; font-weight: 750; letter-spacing: .17em; }
.organize-card h2 { margin: 2px 0 0; font-size: 18px; }
.intro { margin: 12px 0 0 !important; color: var(--text-tertiary) !important; font-size: 10px !important; font-weight: 400 !important; letter-spacing: 0 !important; }
.field { display: grid; gap: 6px; margin-top: 16px; }.field span { color: var(--text-tertiary); font-size: 9px; }
.field input, .folder-picker { box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; text-align: left; }
.suggestions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; align-items: center; }.suggestions span { color: var(--text-tertiary); font-size: 8px; }.suggestions button { padding: 4px 7px; border: 1px solid rgba(255,255,255,.08); border-radius: 999px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; font-size: 8px; }
.operation-options { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 16px; }.operation-options button { display: grid; gap: 4px; padding: 12px; border: 1px solid rgba(255,255,255,.07); border-radius: 9px; background: rgba(255,255,255,.02); color: var(--text-tertiary); text-align: left; cursor: pointer; }.operation-options button.active { border-color: rgba(var(--accent-primary-rgb),.4); background: rgba(var(--accent-primary-rgb),.07); }.operation-options strong { color: var(--text-secondary); font-size: 10px; }.operation-options span { font-size: 8px; line-height: 1.5; }
.operation-error { margin: 10px 0 0; padding: 8px 9px; border-radius: 7px; background: rgba(255,137,117,.055); color: #ff9a86; font-size: 8px; line-height: 1.55; }
footer { display: flex; justify-content: flex-end; gap: 7px; margin-top: 20px; }.organize-card footer button { height: 34px; padding: 0 15px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; }.organize-card footer .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
</style>

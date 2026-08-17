<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { TagQueueItem, TagResult } from '@/stores/tagger'

const props = defineProps<{ item: TagQueueItem | null; affectedCount?: number; saving?: boolean }>()
const emit = defineEmits<{ updateTags: [tags: TagResult[]]; save: []; saveNext: []; applySelected: [] }>()
const localTags = ref<TagResult[]>([])
const input = ref('')
const searchResults = ref<VocabEntry[]>([])
const undoStack = ref<TagResult[][]>([])
const redoStack = ref<TagResult[][]>([])
const MAX_HISTORY = 100
const WEIGHT_STEPS = [1.1, 1.2, 1.3, 1.5, 2.0, 0.9, 0.8, 0.7, 0.5]
const showChinese = ref(false)
const translations = ref<Map<string, string>>(new Map())
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(() => props.item, (item) => { localTags.value = item?.tags.map((tag) => ({ ...tag })) ?? [] }, { immediate: true, deep: true })
watch(() => props.item?.path, () => { undoStack.value = []; redoStack.value = [] })
watch(() => props.item?.tags, async (tags) => {
  translations.value = new Map()
  const names = [...new Set((tags ?? []).map((tag) => tag.tag))]
  if (!names.length || !window.taggerV2API) return
  const response = await window.taggerV2API.translateTags(names, 'en2zh')
  if (response.success && response.data) {
    const map = new Map<string, string>()
    for (const item of response.data) {
      if (item.found && item.translation) map.set(item.tag, item.translation)
    }
    translations.value = map
  }
}, { immediate: true, deep: true })
const groupedTags = computed(() => {
  const groups = new Map<string, TagResult[]>()
  for (const tag of localTags.value) {
    const key = tag.category || '自动识别'
    groups.set(key, [...(groups.get(key) ?? []), tag])
  }
  return [...groups.entries()]
})

function snapshot() { return localTags.value.map((tag) => ({ ...tag })) }
function pushHistory() {
  undoStack.value.push(snapshot())
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}
function restore(next: TagResult[]) { localTags.value = next.map((tag) => ({ ...tag })); commit() }
function undo() {
  if (!undoStack.value.length) return
  redoStack.value.push(snapshot())
  restore(undoStack.value.pop()!)
}
function redo() {
  if (!redoStack.value.length) return
  undoStack.value.push(snapshot())
  restore(redoStack.value.pop()!)
}
function formatWeight(weight: number | undefined) {
  const value = weight ?? 1
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
function cycleWeight(name: string) {
  const tag = localTags.value.find((item) => item.tag === name)
  if (!tag) return
  pushHistory()
  const current = tag.weight ?? 1
  const next = WEIGHT_STEPS.find((step) => step > current + 0.001) ?? undefined
  if (next === undefined) delete tag.weight
  else tag.weight = next
  commit()
}
function commit() { emit('updateTags', localTags.value.map((tag) => ({ ...tag }))) }
function addTag() { const tag = input.value.trim(); if (!tag || localTags.value.some((item) => item.tag === tag)) return; pushHistory(); localTags.value.push({ tag, confidence: 1, source: 'manual', category: '手动添加' }); input.value = ''; commit() }
function removeTag(name: string) { pushHistory(); localTags.value = localTags.value.filter((tag) => tag.tag !== name); commit() }
function addSearchResult(tag: string) {
  if (localTags.value.some((item) => item.tag === tag)) return
  pushHistory()
  localTags.value.push({ tag, confidence: 1, source: 'manual', category: '手动添加' })
  input.value = ''
  searchResults.value = []
  commit()
}
function onKeydown(event: KeyboardEvent) {
  if (!props.item) return
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
watch(input, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  const query = value.trim()
  if (!query) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    if (!window.taggerV2API) return
    const result = await window.taggerV2API.searchTags(query, 'contains', 20, null)
    if (result.success && result.data) searchResults.value = result.data
  }, 120)
})
</script>

<template>
  <aside class="tag-editor">
    <header><div><p>REVIEW</p><h2>标签校对</h2></div><div class="tag-editor__history"><button type="button" title="撤销 (Ctrl+Z)" :disabled="undoStack.length === 0" @click="undo">↶</button><button type="button" title="重做 (Ctrl+Shift+Z)" :disabled="redoStack.length === 0" @click="redo">↷</button><button type="button" :class="{ active: showChinese }" title="显示中文翻译" @click="showChinese = !showChinese">中</button></div><span v-if="item" :class="`status-${item.status}`">{{ item.status === 'reviewed' ? '已保存' : item.status === 'partial' ? '部分保存' : item.status === 'failed' ? '需要处理' : '待校对' }}</span></header>
    <template v-if="item">
      <div class="tag-editor__scroll">
        <div v-if="item.error" class="save-error"><strong>{{ item.status === 'partial' ? '部分保存' : '处理失败' }}</strong><span>{{ item.error }}</span></div>
        <label class="tag-search"><input v-model="input" placeholder="搜索或添加标签" @keydown.enter.prevent="addTag" /><button :disabled="!input.trim()" @click="addTag">添加</button></label>
        <div v-if="searchResults.length" class="tag-search-results">
          <button v-for="result in searchResults" :key="result.tag" @click="addSearchResult(result.tag)">
            <span>{{ result.tag }}</span>
            <small v-if="(result as any).chineseName">{{ (result as any).chineseName }}</small>
            <em>{{ result.category }}</em>
          </button>
        </div>
        <section v-for="[group, tags] in groupedTags" :key="group" class="tag-group">
          <div><strong>{{ group }}</strong><span>{{ tags.length }}</span></div>
          <div class="tag-chips"><button v-for="tag in tags" :key="tag.tag" class="tag-chip" @click="removeTag(tag.tag)"><span :title="showChinese ? tag.tag : (translations.get(tag.tag) || '')">{{ showChinese ? (translations.get(tag.tag) || tag.tag) : tag.tag }}</span><small v-if="tag.confidence !== undefined && tag.confidence < 1">{{ Math.round(tag.confidence * 100) }}%</small><small class="tag-chip__weight" :class="{ active: (tag.weight ?? 1) !== 1 }" title="点击调整权重" @click.stop="cycleWeight(tag.tag)">{{ (tag.weight ?? 1) === 1 ? '+w' : `${tag.weight! > 1 ? '↑' : '↓'}${formatWeight(tag.weight)}` }}</small><i>×</i></button></div>
        </section>
        <div v-if="localTags.length === 0" class="tag-empty"><strong>还没有标签</strong><span>运行自动标注，或在上方手动添加。</span></div>
      </div>
      <footer>
        <button v-if="affectedCount && affectedCount > 1" class="apply-many" @click="$emit('applySelected')">应用到所选 {{ affectedCount }} 张</button>
        <div><button :disabled="saving" @click="$emit('save')">仅保存</button><button class="primary" :disabled="saving" @click="$emit('saveNext')">{{ saving ? '保存中…' : '保存并下一张' }}</button></div>
      </footer>
    </template>
    <div v-else class="editor-empty"><span>选择图片后在这里校对标签</span></div>
  </aside>
</template>

<style scoped>
.tag-editor { width: 300px; flex: 0 0 300px; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 0; border-radius: 12px; background: linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); }
.tag-editor > header { height: 44px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 13px; border: 0; }
.tag-editor header p { margin: 0 0 2px; color: var(--accent-primary); font-size: 7px; font-weight: 750; letter-spacing: .16em; }
.tag-editor h2 { margin: 0; font-size: 13px; }
.tag-editor header > span { padding: 4px 7px; border-radius: 999px; background: rgba(120,200,255,.08); color: #78c8ff; font-size: 7px; }
.tag-editor__history { display: flex; gap: 4px; }.tag-editor__history button { width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.08); border-radius: 7px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; font-size: 14px; }.tag-editor__history button:disabled { opacity: .28; cursor: not-allowed; }.tag-editor__history button.active { background: rgba(var(--accent-primary-rgb),.16); color: var(--accent-primary); }
.tag-editor header > span.status-reviewed { background: rgba(121,215,160,.08); color: #79d7a0; }.tag-editor header > span.status-failed, .tag-editor header > span.status-partial { background: rgba(255,137,117,.08); color: #ff9a86; }
.tag-editor__scroll { flex: 1; min-height: 0; overflow: auto; padding: 11px; }
.save-error { display: grid; gap: 4px; margin-bottom: 10px; padding: 9px; border: 1px solid rgba(255,137,117,.14); border-radius: 8px; background: rgba(255,137,117,.055); }
.save-error strong { color: #ff9a86; font-size: 9px; }.save-error span { color: var(--text-tertiary); font-size: 8px; line-height: 1.5; }
.tag-search { display: flex; gap: 5px; }.tag-search input { flex: 1; min-width: 0; height: 34px; padding: 0 9px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-primary); outline: none; font: inherit; font-size: 9px; }.tag-search button { padding: 0 9px; border: 0; border-radius: 8px; background: rgba(var(--accent-primary-rgb),.12); color: var(--accent-primary); cursor: pointer; font-size: 8px; }
.tag-search-results { display: grid; gap: 3px; margin-top: 5px; max-height: 160px; overflow: auto; }.tag-search-results button { display: flex; align-items: center; gap: 6px; padding: 7px 8px; border: 1px solid rgba(255,255,255,.06); border-radius: 7px; background: rgba(255,255,255,.025); color: var(--text-secondary); cursor: pointer; text-align: left; }.tag-search-results span { font-size: 9px; }.tag-search-results small { color: var(--text-tertiary); font-size: 7px; }.tag-search-results em { margin-left: auto; color: var(--text-tertiary); font-size: 7px; font-style: normal; }
.tag-group { margin-top: 16px; }.tag-group > div:first-child { display: flex; justify-content: space-between; margin-bottom: 7px; }.tag-group strong { color: var(--text-tertiary); font-size: 8px; font-weight: 650; }.tag-group > div:first-child span { color: var(--text-tertiary); font-size: 7px; }
.tag-chips { display: flex; flex-wrap: wrap; gap: 5px; }.tag-chips .tag-chip { display: flex; align-items: center; gap: 4px; padding: 5px 6px 5px 8px; border: 1px solid rgba(255,255,255,.07); border-radius: 999px; background: rgba(255,255,255,.025); color: var(--text-secondary); cursor: pointer; font-size: 8px; }.tag-chips small { color: var(--text-tertiary); font-size: 6px; }.tag-chips i { color: var(--text-tertiary); font-style: normal; }.tag-chip__weight { padding: 1px 4px; border-radius: 6px; background: rgba(255,255,255,.05); color: var(--text-tertiary); cursor: pointer; }.tag-chip__weight.active { background: rgba(var(--accent-primary-rgb),.16); color: var(--accent-primary); }
.tag-empty, .editor-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-tertiary); text-align: center; }.tag-empty { min-height: 150px; gap: 6px; }.tag-empty strong { color: var(--text-secondary); font-size: 11px; }.tag-empty span { font-size: 8px; }
.editor-empty { padding: 0 12px; }.editor-empty span { color: var(--text-tertiary); font-size: 8px; white-space: nowrap; }
.tag-editor > footer { flex: none; display: grid; gap: 7px; padding: 9px; border: 0; }.tag-editor footer > div { display: grid; grid-template-columns: .7fr 1.3fr; gap: 6px; }.tag-editor footer button { height: 34px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; font-size: 8px; }.tag-editor footer .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }.tag-editor footer .apply-many { color: var(--text-tertiary); }
@media (max-width: 1200px) {
  .tag-editor { width: 258px; flex-basis: 258px; }
}
@media (max-width: 980px) {
  .tag-editor { position: absolute; z-index: 12; top: 0; right: 0; bottom: 0; width: min(300px, calc(100% - 64px)); flex-basis: auto; box-shadow: 0 18px 55px rgba(0,0,0,.28); }
}
</style>

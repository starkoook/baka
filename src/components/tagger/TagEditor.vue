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
        <section v-for="[group, tags] in groupedTags" :key="group" class="tag-group" :data-group="group">
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
/* 右栏：参照设计稿的白色面板 + 直角为主 */
.tag-editor { width: 300px; flex: 0 0 300px; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e1e7db; border-radius: 12px; background: #fcfdf9; color: #34402f; font-size: 13px; }
.tag-editor > header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 18px 18px 12px; border-bottom: 1px solid #e1e7db; }
.tag-editor header p { margin: 0 0 2px; font: 10px/1.5 Arial, sans-serif; letter-spacing: .09em; color: #8a9581; }
.tag-editor h2 { margin: 0; font-size: 15px; font-weight: 500; }
.tag-editor header > span { padding: 4px 8px; border-radius: 20px; background: #e5eef6; color: #3d6079; font-size: 11px; white-space: nowrap; }
.tag-editor header > span.status-reviewed { background: #e8f0e1; color: #3f6b3a; }
.tag-editor header > span.status-failed, .tag-editor header > span.status-partial { background: #f5e6e6; color: #a3474f; }
.tag-editor__history { display: flex; gap: 4px; margin-left: auto; }
.tag-editor__history button { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid #e1e7db; border-radius: 5px; background: #fafcf6; color: #55684b; font: inherit; font-size: 13px; cursor: pointer; }
.tag-editor__history button:hover:not(:disabled) { filter: brightness(.96); }
.tag-editor__history button:disabled { opacity: .3; cursor: default; }
.tag-editor__history button.active { background: #e6eedc; border-color: #bacbaa; color: #405b33; }
.tag-editor__scroll { flex: 1; min-height: 0; overflow: auto; padding: 16px 18px; scrollbar-width: thin; scrollbar-color: #cad7be transparent; }
.save-error { display: grid; gap: 4px; margin-bottom: 12px; padding: 9px 11px; border: 1px solid #e8d2d2; border-radius: 6px; background: #f5e6e6; }
.save-error strong { color: #a3474f; font-size: 12px; font-weight: 500; }
.save-error span { color: #6d5a5a; font-size: 11.5px; line-height: 1.5; }
.tag-search { display: flex; gap: 6px; }
.tag-search input { flex: 1; min-width: 0; height: 36px; padding: 0 10px; border: 1px solid #cddbc1; border-radius: 6px; background: #fff; color: #34402f; outline: none; font: inherit; font-size: 12.5px; }
.tag-search input:focus { outline: 2px solid #68865c; outline-offset: 2px; }
.tag-search input::placeholder { color: #97a08f; }
.tag-search button { height: 36px; padding: 0 12px; border: 0; border-radius: 6px; background: #58734a; color: #fff; font: inherit; font-size: 12.5px; cursor: pointer; }
.tag-search button:hover:not(:disabled) { filter: brightness(.96); }
.tag-search button:disabled { opacity: .35; cursor: default; }
.tag-search-results { display: grid; gap: 2px; margin-top: 6px; max-height: 180px; overflow: auto; padding: 4px; border: 1px solid #e1e7db; border-radius: 6px; background: #fafcf6; }
.tag-search-results button { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border: 0; border-radius: 4px; background: transparent; color: #34402f; cursor: pointer; text-align: left; font: inherit; }
.tag-search-results button:hover { background: #eef3e7; }
.tag-search-results span { font-size: 12.5px; }
.tag-search-results small { color: #788271; font-size: 11px; }
.tag-search-results em { margin-left: auto; color: #97a08f; font: 10px Arial, sans-serif; font-style: normal; letter-spacing: .04em; }
.tag-group { margin-top: 18px; }
.tag-group > div:first-child { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.tag-group strong { color: #55684b; font-size: 12.5px; font-weight: 500; }
.tag-group > div:first-child span { color: #97a08f; font: 11px Arial, sans-serif; }
.tag-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-chips .tag-chip { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 7px 0 10px; border: 1px solid #dfe5d7; border-radius: 5px; background: #fafbf7; color: #405b33; cursor: pointer; font: inherit; font-size: 12px; transition: background-color .12s ease, border-color .12s ease; }
.tag-chips .tag-chip:hover { background: #eef3e7; border-color: #bacbaa; }
.tag-chips small { color: #7d8874; font: 10.5px Arial, sans-serif; font-variant-numeric: tabular-nums; }
.tag-chips i { color: #97a08f; font-style: normal; }
.tag-chips .tag-chip:hover i { color: #a3474f; }
.tag-chip__weight { padding: 0 5px; border-radius: 3px; background: #edf2e6; color: #7d8874; cursor: pointer; }
.tag-chip__weight.active { background: #58734a; color: #fff; }
/* 类别只用左侧色条区分，保持克制 */
.tag-group[data-group="角色"] .tag-chip, .tag-group[data-group="character"] .tag-chip { border-left: 3px solid #8ca07f; }
.tag-group[data-group="版权"] .tag-chip, .tag-group[data-group="copyright"] .tag-chip { border-left: 3px solid #7f98b4; }
.tag-group[data-group="质量"] .tag-chip, .tag-group[data-group="quality"] .tag-chip { border-left: 3px solid #c2b06a; }
.tag-group[data-group="手动添加"] .tag-chip { border-left: 3px solid #d0a37c; }
.tag-empty, .editor-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #849078; text-align: center; }
.tag-empty { min-height: 160px; gap: 6px; }
.tag-empty strong { color: #3f5c31; font-size: 14px; font-weight: 500; }
.tag-empty span { font-size: 12px; }
.editor-empty { padding: 0 16px; }
.editor-empty span { font-size: 12px; white-space: nowrap; }
.tag-editor > footer { flex: none; display: grid; gap: 8px; padding: 14px 18px 16px; border-top: 1px solid #e1e7db; }
.tag-editor footer > div { display: grid; grid-template-columns: .8fr 1.4fr; gap: 8px; }
.tag-editor footer button { height: 40px; border: 1px solid #d6e0cc; border-radius: 6px; background: #fbfcf8; color: #55684b; cursor: pointer; font: inherit; font-size: 13px; }
.tag-editor footer button:hover:not(:disabled) { filter: brightness(.97); }
.tag-editor footer .primary { border-color: transparent; background: #58734a; color: #fff; letter-spacing: .06em; box-shadow: 0 3px 6px #3852290a; }
.tag-editor footer .apply-many { color: #405b33; background: #e6eedc; border-color: #bacbaa; }
.tag-editor footer button:disabled { opacity: .35; cursor: default; }
@media (max-width: 1240px) {
  .tag-editor { width: 260px; flex-basis: 260px; }
}
@media (max-width: 980px) {
  .tag-editor { position: absolute; z-index: 12; top: 0; right: 0; bottom: 0; width: min(300px, calc(100% - 64px)); flex-basis: auto; box-shadow: 0 18px 55px rgba(49, 71, 46, .18); }
}
@media (prefers-reduced-motion: reduce) { .tag-chips .tag-chip { transition: none; } }
</style>

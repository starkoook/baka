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
.tag-editor { width: 300px; flex: 0 0 300px; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 0; border-radius: 28px; background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.tag-editor > header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 16px 16px 8px; }
.tag-editor header p { display: none; }
.tag-editor h2 { margin: 0; font-size: 15px; font-weight: 900; color: var(--ink-primary); }
.tag-editor header > span { padding: 4px 10px; border-radius: 999px; background: var(--accent-sky-soft); color: #2b7fb8; font-size: 10.5px; font-weight: 800; white-space: nowrap; }
.tag-editor header > span.status-reviewed { background: var(--accent-mint-soft); color: var(--accent-mint-strong); }
.tag-editor header > span.status-failed, .tag-editor header > span.status-partial { background: var(--danger-bg); color: var(--danger-foreground); }
.tag-editor__history { display: flex; gap: 4px; margin-left: auto; }
.tag-editor__history button { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 13px; font-weight: 800; }
.tag-editor__history button:hover:not(:disabled) { background: var(--brand-soft); color: var(--brand-hover); }
.tag-editor__history button:disabled { opacity: .3; cursor: not-allowed; }
.tag-editor__history button.active { background: var(--brand-primary); color: var(--brand-on-primary); }
.tag-editor__scroll { flex: 1; min-height: 0; overflow: auto; padding: 6px 16px 12px; scrollbar-width: thin; }
.save-error { display: grid; gap: 4px; margin-bottom: 12px; padding: 10px 12px; border-radius: 16px; background: var(--danger-bg); }
.save-error strong { color: var(--danger-foreground); font-size: 12px; font-weight: 800; }
.save-error span { color: var(--ink-secondary); font-size: 11px; line-height: 1.5; }
.tag-search { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 6px 0 14px; border: 1.5px dashed var(--line-strong); border-radius: 999px; background: var(--surface-primary); transition: border-color 140ms ease, box-shadow 140ms ease; }
.tag-search:focus-within { border-style: solid; border-color: var(--brand-primary); box-shadow: 0 0 0 4px var(--brand-soft); }
.tag-search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ink-primary); outline: none; font: inherit; font-size: 12px; }
.tag-search input::placeholder { color: var(--ink-tertiary); }
.tag-search button { height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--brand-primary); color: var(--brand-on-primary); cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 800; }
.tag-search button:disabled { opacity: .35; cursor: not-allowed; }
.tag-search-results { display: grid; gap: 3px; margin-top: 6px; max-height: 180px; overflow: auto; padding: 6px; border-radius: 16px; background: var(--surface-secondary); }
.tag-search-results button { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ink-primary); cursor: pointer; text-align: left; font: inherit; }
.tag-search-results button:hover { background: var(--surface-primary); }
.tag-search-results span { font-size: 12px; font-weight: 600; }
.tag-search-results small { color: var(--ink-tertiary); font-size: 10.5px; }
.tag-search-results em { margin-left: auto; color: var(--ink-quaternary); font-size: 10px; font-style: normal; font-family: var(--font-mono); }
.tag-group { margin-top: 16px; }
.tag-group > div:first-child { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; padding: 0 2px; }
.tag-group strong { color: var(--ink-tertiary); font-size: 11px; font-weight: 800; letter-spacing: .04em; }
.tag-group > div:first-child span { color: var(--ink-quaternary); font: 10.5px var(--font-mono); }
.tag-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tag-chips .tag-chip { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 8px 0 11px; border: 0; border-radius: 999px; background: var(--brand-tint); color: var(--ink-primary); cursor: pointer; font: inherit; font-size: 11.5px; font-weight: 700; transition: transform .2s var(--ease-bounce), background-color 140ms ease; }
.tag-chips .tag-chip:hover { background: var(--brand-soft); transform: translateY(-1px); }
.tag-chips small { color: var(--ink-tertiary); font: 10px var(--font-mono); }
.tag-chips i { color: var(--ink-quaternary); font-style: normal; font-weight: 800; }
.tag-chips .tag-chip:hover i { color: var(--danger-foreground); }
.tag-chip__weight { padding: 1px 6px; border-radius: 999px; background: rgba(255,255,255,.7); color: var(--ink-tertiary); cursor: pointer; }
.tag-chip__weight.active { background: var(--brand-primary); color: var(--brand-on-primary); }
/* 不同类别的标签用不同的糖果色 */
.tag-group[data-group="角色"] .tag-chip, .tag-group[data-group="character"] .tag-chip { background: var(--accent-lavender-soft); }
.tag-group[data-group="版权"] .tag-chip, .tag-group[data-group="copyright"] .tag-chip { background: var(--accent-sky-soft); }
.tag-group[data-group="质量"] .tag-chip, .tag-group[data-group="quality"] .tag-chip { background: var(--accent-mint-soft); }
.tag-group[data-group="手动添加"] .tag-chip { background: var(--accent-peach-soft); }
.tag-empty, .editor-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--ink-tertiary); text-align: center; }
.tag-empty { min-height: 160px; gap: 6px; }
.tag-empty strong { color: var(--ink-primary); font-size: 13px; font-weight: 800; }
.tag-empty span { font-size: 11.5px; }
.editor-empty { padding: 0 16px; }
.editor-empty span { color: var(--ink-tertiary); font-size: 12px; white-space: nowrap; }
.tag-editor > footer { flex: none; display: grid; gap: 8px; padding: 10px 14px 14px; }
.tag-editor footer > div { display: grid; grid-template-columns: .8fr 1.4fr; gap: 8px; }
.tag-editor footer button { height: 40px; border: 0; border-radius: 999px; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 800; transition: transform .16s var(--ease-bounce), background-color 140ms ease; }
.tag-editor footer button:hover:not(:disabled) { background: var(--brand-soft); color: var(--brand-hover); }
.tag-editor footer button:active:not(:disabled) { transform: scale(.97); }
.tag-editor footer .primary { background: var(--brand-gradient); color: var(--brand-on-primary); box-shadow: 0 10px 22px rgba(var(--brand-primary-rgb), .32); }
.tag-editor footer .primary:hover:not(:disabled) { color: #fff; }
.tag-editor footer .apply-many { color: var(--accent-lavender-strong); background: var(--accent-lavender-soft); }
.tag-editor footer button:disabled { opacity: .45; cursor: not-allowed; }
@media (max-width: 1200px) {
  .tag-editor { width: 258px; flex-basis: 258px; }
}
@media (max-width: 980px) {
  .tag-editor { position: absolute; z-index: 12; top: 0; right: 0; bottom: 0; width: min(300px, calc(100% - 64px)); flex-basis: auto; box-shadow: var(--surface-shadow-lg); }
}
@media (prefers-reduced-motion: reduce) { .tag-chips .tag-chip, .tag-editor footer button { transition: none; } }
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { diffTags, serializeWeightedCaption } from '@/features/tagger/caption'
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

/** 每张图独立保留撤销/重做记录（会话内），切走再切回来还能继续撤销 */
const historyByPath = new Map<string, { undo: TagResult[][]; redo: TagResult[][] }>()
let historyPath = ''
function stashHistory() {
  if (historyPath) historyByPath.set(historyPath, { undo: undoStack.value, redo: redoStack.value })
}
function restoreHistory(path: string) {
  const saved = historyByPath.get(path)
  undoStack.value = saved?.undo ?? []
  redoStack.value = saved?.redo ?? []
  historyPath = path
}

/** "保存前"的快照：切到这张图或它刚保存成功时记一次，供按住对比 */
const baseline = ref<TagResult[]>([])
/** 按住对比的来源：saved = 保存前，step = 上一步编辑前 */
const compareMode = ref<'saved' | 'step' | null>(null)
const comparing = computed(() => compareMode.value !== null)
const compareSource = computed<TagResult[]>(() => compareMode.value === 'step' ? (undoStack.value[undoStack.value.length - 1] ?? []) : baseline.value)
const savedDiff = computed(() => diffTags(baseline.value, localTags.value))
const diff = computed(() => diffTags(compareSource.value, localTags.value))
const isDirty = computed(() => savedDiff.value.added.length > 0 || savedDiff.value.removed.length > 0 || localTags.value.some((tag) => {
  const before = baseline.value.find((entry) => entry.tag === tag.tag)
  return before && (before.weight ?? 1) !== (tag.weight ?? 1)
}))
function snapshotBaseline() {
  baseline.value = (props.item?.tags ?? []).map((tag) => ({ ...tag }))
}

/** 实时 caption 预览：最终写进 .txt 的那一行 */
const captionPreview = computed(() => serializeWeightedCaption(localTags.value))
const showCaption = ref(false)
const copied = ref(false)
async function copyCaption() {
  if (!captionPreview.value) return
  try {
    await navigator.clipboard?.writeText(captionPreview.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1400)
  } catch { /* 剪贴板不可用时静默 */ }
}

watch(() => props.item, (item) => { localTags.value = item?.tags.map((tag) => ({ ...tag })) ?? [] }, { immediate: true, deep: true })
watch(() => props.item?.path, (path) => {
  stashHistory()
  restoreHistory(path ?? '')
  snapshotBaseline()
  compareMode.value = null
}, { immediate: true })
// 保存成功后 status 变成 reviewed，此时"保存前"就是现在
watch(() => props.item?.status, (status) => { if (status === 'reviewed') snapshotBaseline() })
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
/** 清空全部标签，可撤销 */
function clearAll() { if (!localTags.value.length) return; pushHistory(); localTags.value = []; commit() }
function startCompare(mode: 'saved' | 'step' = 'saved') {
  if (mode === 'saved' && !isDirty.value) return
  if (mode === 'step' && undoStack.value.length === 0) return
  compareMode.value = mode
}
function stopCompare() { compareMode.value = null }
function compareState(name: string) {
  if (diff.value.removed.includes(name)) return 'will-remove'
  return ''
}
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
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
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
    <header><div><p>REVIEW</p><h2>标签校对</h2></div><div class="tag-editor__history"><button type="button" title="撤销 (Ctrl+Z)" :disabled="undoStack.length === 0" @click="undo">↶</button><button type="button" title="重做 (Ctrl+Shift+Z)" :disabled="redoStack.length === 0" @click="redo">↷</button><button type="button" :class="{ active: showChinese }" title="显示中文翻译" @click="showChinese = !showChinese">中</button><button type="button" class="tag-editor__clear" title="清空全部标签（可撤销）" :disabled="!localTags.length" @click="clearAll">清空</button></div><span v-if="item" :class="`status-${item.status}`">{{ item.status === 'reviewed' ? '已保存' : item.status === 'partial' ? '部分保存' : item.status === 'failed' ? '需要处理' : '待校对' }}</span></header>
    <template v-if="item">
      <div class="tag-editor__scroll">
        <div v-if="item.error" class="save-error"><strong>{{ item.status === 'partial' ? '部分保存' : '处理失败' }}</strong><span>{{ item.error }}</span></div>
        <label class="tag-search"><input v-model="input" placeholder="搜索或添加标签" @keydown.enter.prevent="addTag" /><button :disabled="!input.trim()" @click="addTag">添加</button></label>

        <div class="caption-box" :class="{ 'is-open': showCaption }">
          <button type="button" class="caption-box__toggle" :aria-expanded="showCaption" @click="showCaption = !showCaption">
            <span>caption 预览</span><small>{{ localTags.length }} 个标签 · {{ captionPreview.length }} 字符</small><i aria-hidden="true">{{ showCaption ? '▴' : '▾' }}</i>
          </button>
          <div v-if="showCaption" class="caption-box__body">
            <p>{{ captionPreview || '（还没有标签）' }}</p>
            <button type="button" :disabled="!captionPreview" @click="copyCaption">{{ copied ? '已复制' : '复制' }}</button>
          </div>
        </div>

        <div v-if="isDirty || undoStack.length" class="compare-bar">
          <span v-if="isDirty"><b>{{ savedDiff.added.length }}</b> 新增 · <b>{{ savedDiff.removed.length }}</b> 删除</span>
          <span v-else>已改 {{ undoStack.length }} 步</span>
          <span class="compare-bar__buttons">
            <button
              v-if="isDirty"
              type="button"
              class="compare-bar__hold"
              :class="{ active: compareMode === 'saved' }"
              title="按住查看保存前的标签，松开返回"
              @pointerdown.prevent="startCompare('saved')"
              @pointerup="stopCompare"
              @pointerleave="stopCompare"
              @pointercancel="stopCompare"
              @keydown.space.prevent="startCompare('saved')"
              @keydown.enter.prevent="startCompare('saved')"
              @keyup="stopCompare"
              @blur="stopCompare"
            >{{ compareMode === 'saved' ? '保存前 · 松开返回' : '按住看保存前' }}</button>
            <button
              v-if="undoStack.length"
              type="button"
              class="compare-bar__hold"
              :class="{ active: compareMode === 'step' }"
              title="按住查看上一步编辑前的标签，松开返回"
              @pointerdown.prevent="startCompare('step')"
              @pointerup="stopCompare"
              @pointerleave="stopCompare"
              @pointercancel="stopCompare"
              @keydown.space.prevent="startCompare('step')"
              @keydown.enter.prevent="startCompare('step')"
              @keyup="stopCompare"
              @blur="stopCompare"
            >{{ compareMode === 'step' ? '上一步 · 松开返回' : '按住看上一步' }}</button>
          </span>
        </div>
        <div v-if="comparing" class="compare-view" aria-live="polite">
          <div><strong>{{ compareMode === 'step' ? '上一步编辑前' : '保存前' }}</strong><span>{{ compareSource.length }} 个标签 · 红色的是现在已经没有的</span></div>
          <div class="tag-chips">
            <span v-for="tag in compareSource" :key="tag.tag" class="tag-chip tag-chip--static" :class="compareState(tag.tag)">{{ tag.tag }}<small v-if="(tag.weight ?? 1) !== 1">{{ formatWeight(tag.weight) }}</small></span>
          </div>
          <p v-if="diff.added.length" class="compare-view__added">现在新增：{{ diff.added.join('、') }}</p>
        </div>
        <div v-if="searchResults.length" class="tag-search-results">
          <button v-for="result in searchResults" :key="result.tag" @click="addSearchResult(result.tag)">
            <span>{{ result.tag }}</span>
            <small v-if="(result as any).chineseName">{{ (result as any).chineseName }}</small>
            <em>{{ result.category }}</em>
          </button>
        </div>
        <section v-for="[group, tags] in groupedTags" v-show="!comparing" :key="group" class="tag-group" :data-group="group">
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
.tag-editor__history .tag-editor__clear { width: auto; padding: 0 10px; border-radius: 999px; font-size: 11px; }
.caption-box { margin-top: 10px; border-radius: 16px; background: var(--surface-secondary); }
.caption-box__toggle { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 0; background: transparent; color: var(--ink-secondary); font: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; text-align: left; }
.caption-box__toggle small { flex: 1; color: var(--ink-tertiary); font: 10.5px var(--font-mono); font-weight: 600; }
.caption-box__toggle i { font-style: normal; color: var(--ink-quaternary); }
.caption-box__body { display: grid; gap: 8px; padding: 0 12px 10px; }
.caption-box__body p { margin: 0; max-height: 120px; overflow: auto; color: var(--ink-primary); font: 11.5px/1.6 var(--font-mono); word-break: break-word; user-select: text; }
.caption-box__body button { justify-self: end; height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--surface-primary); color: var(--brand-hover); font: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; box-shadow: var(--shadow-sm); }
.caption-box__body button:disabled { opacity: .4; cursor: not-allowed; }
.compare-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding: 6px 6px 6px 12px; border-radius: 999px; background: var(--accent-peach-soft); color: var(--accent-peach-strong); font-size: 11.5px; font-weight: 700; }
.compare-bar > span:first-child { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.compare-bar b { font-family: var(--font-mono); }
.compare-bar__buttons { display: flex; gap: 4px; flex: none; }
.compare-bar__hold { height: 28px; padding: 0 10px; white-space: nowrap; border: 0; border-radius: 999px; background: var(--surface-primary); color: var(--accent-peach-strong); font: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; user-select: none; touch-action: none; }
.compare-bar__hold.active { background: var(--accent-peach-strong); color: #fff; }
.compare-view { margin-top: 12px; padding: 12px; border-radius: 16px; border: 1.5px dashed var(--accent-peach); background: var(--surface-primary); }
.compare-view > div:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.compare-view strong { font-size: 12px; font-weight: 900; color: var(--ink-primary); }
.compare-view > div:first-child span { color: var(--ink-tertiary); font-size: 10.5px; }
.tag-chip--static { cursor: default !important; }
.tag-chip--static.will-remove { background: var(--danger-bg) !important; color: var(--danger-foreground); text-decoration: line-through; }
.compare-view__added { margin: 10px 0 0; color: var(--accent-mint-strong); font-size: 11.5px; line-height: 1.6; }
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

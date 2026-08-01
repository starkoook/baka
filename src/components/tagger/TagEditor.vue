<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TagQueueItem, TagResult } from '@/stores/tagger'

const props = defineProps<{ item: TagQueueItem | null; affectedCount?: number; saving?: boolean }>()
const emit = defineEmits<{ updateTags: [tags: TagResult[]]; save: []; saveNext: []; applySelected: [] }>()
const localTags = ref<TagResult[]>([])
const input = ref('')

watch(() => props.item, (item) => { localTags.value = item?.tags.map((tag) => ({ ...tag })) ?? [] }, { immediate: true, deep: true })
const groupedTags = computed(() => {
  const groups = new Map<string, TagResult[]>()
  for (const tag of localTags.value) {
    const key = tag.category || '自动识别'
    groups.set(key, [...(groups.get(key) ?? []), tag])
  }
  return [...groups.entries()]
})

function commit() { emit('updateTags', localTags.value.map((tag) => ({ ...tag }))) }
function addTag() { const tag = input.value.trim(); if (!tag || localTags.value.some((item) => item.tag === tag)) return; localTags.value.push({ tag, confidence: 1, source: 'manual', category: '手动添加' }); input.value = ''; commit() }
function removeTag(name: string) { localTags.value = localTags.value.filter((tag) => tag.tag !== name); commit() }
</script>

<template>
  <aside class="tag-editor">
    <header><div><p>REVIEW</p><h2>标签校对</h2></div><span v-if="item" :class="`status-${item.status}`">{{ item.status === 'reviewed' ? '已保存' : item.status === 'partial' ? '部分保存' : item.status === 'failed' ? '需要处理' : '待校对' }}</span></header>
    <template v-if="item">
      <div class="tag-editor__scroll">
        <div v-if="item.error" class="save-error"><strong>{{ item.status === 'partial' ? '部分保存' : '处理失败' }}</strong><span>{{ item.error }}</span></div>
        <label class="tag-search"><input v-model="input" placeholder="搜索或添加标签" @keydown.enter.prevent="addTag" /><button :disabled="!input.trim()" @click="addTag">添加</button></label>
        <section v-for="[group, tags] in groupedTags" :key="group" class="tag-group">
          <div><strong>{{ group }}</strong><span>{{ tags.length }}</span></div>
          <div class="tag-chips"><button v-for="tag in tags" :key="tag.tag" @click="removeTag(tag.tag)"><span>{{ tag.tag }}</span><small v-if="tag.confidence !== undefined">{{ Math.round(tag.confidence * 100) }}%</small><i>×</i></button></div>
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
.tag-editor { width: 310px; flex: 0 0 310px; min-height: 0; display: flex; flex-direction: column; border-left: 1px solid rgba(255,255,255,.065); background: rgba(10,9,13,.12); }.tag-editor > header { height: 59px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; border-bottom: 1px solid rgba(255,255,255,.055); }.tag-editor header p { margin: 0 0 2px; color: var(--accent-primary); font-size: 7px; font-weight: 750; letter-spacing: .16em; }.tag-editor h2 { margin: 0; font-size: 13px; }.tag-editor header > span { padding: 4px 7px; border-radius: 999px; background: rgba(120,200,255,.08); color: #78c8ff; font-size: 7px; }.tag-editor header > span.status-reviewed { background: rgba(121,215,160,.08); color: #79d7a0; }.tag-editor header > span.status-failed, .tag-editor header > span.status-partial { background: rgba(255,137,117,.08); color: #ff9a86; }.tag-editor__scroll { flex: 1; min-height: 0; overflow: auto; padding: 13px; }.save-error { display: grid; gap: 4px; margin-bottom: 10px; padding: 9px; border: 1px solid rgba(255,137,117,.14); border-radius: 8px; background: rgba(255,137,117,.055); }.save-error strong { color: #ff9a86; font-size: 9px; }.save-error span { color: var(--text-tertiary); font-size: 8px; line-height: 1.5; }.tag-search { display: flex; gap: 5px; }.tag-search input { flex: 1; min-width: 0; height: 34px; padding: 0 9px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-primary); outline: none; font: inherit; font-size: 9px; }.tag-search button { padding: 0 9px; border: 0; border-radius: 8px; background: rgba(var(--accent-primary-rgb),.12); color: var(--accent-primary); cursor: pointer; font-size: 8px; }.tag-group { margin-top: 16px; }.tag-group > div:first-child { display: flex; justify-content: space-between; margin-bottom: 7px; }.tag-group strong { color: var(--text-tertiary); font-size: 8px; font-weight: 650; }.tag-group > div:first-child span { color: var(--text-tertiary); font-size: 7px; }.tag-chips { display: flex; flex-wrap: wrap; gap: 5px; }.tag-chips button { display: flex; align-items: center; gap: 4px; padding: 5px 6px 5px 8px; border: 1px solid rgba(255,255,255,.07); border-radius: 999px; background: rgba(255,255,255,.025); color: var(--text-secondary); cursor: pointer; font-size: 8px; }.tag-chips small { color: var(--text-tertiary); font-size: 6px; }.tag-chips i { color: var(--text-tertiary); font-style: normal; }.tag-empty, .editor-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-tertiary); text-align: center; }.tag-empty { min-height: 150px; }.tag-empty strong, .editor-empty strong { color: var(--text-secondary); font-size: 11px; }.tag-empty span, .editor-empty span { font-size: 8px; }.tag-editor > footer { flex: none; display: grid; gap: 7px; padding: 11px; border-top: 1px solid rgba(255,255,255,.055); }.tag-editor footer > div { display: grid; grid-template-columns: .7fr 1.3fr; gap: 6px; }.tag-editor footer button { height: 34px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; font-size: 8px; }.tag-editor footer .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }.tag-editor footer .apply-many { color: var(--text-tertiary); }@media (max-width: 1050px) { .tag-editor { width: 270px; flex-basis: 270px; } }
.tag-editor { width: 300px; flex-basis: 300px; }
.tag-editor > header { height: 44px; padding: 0 12px; }
.tag-editor__scroll { padding: 11px; }
.tag-editor > footer { padding: 9px; }
@media (max-width: 1050px) { .tag-editor { width: 260px; flex-basis: 260px; } }
.tag-editor { width: 300px; flex-basis: 300px; overflow: hidden; border: 0; border-radius: 12px; background: linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); }
.tag-editor > header { height: 44px; padding: 0 13px; border: 0; }
.tag-editor > footer { border: 0; }
.editor-empty { gap: 0; padding: 0 12px; }
.editor-empty span { color: var(--text-tertiary); font-size: 8px; white-space: nowrap; }
@media (max-width: 1200px) { .tag-editor { width: 258px; flex-basis: 258px; } }
@media (max-width: 980px) { .tag-editor { position: absolute; z-index: 12; top: 0; right: 0; bottom: 0; width: min(300px, calc(100% - 64px)); flex-basis: auto; box-shadow: 0 18px 55px rgba(0,0,0,.28); } }
</style>

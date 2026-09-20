<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useTaggerStore } from '@/stores/tagger'

const emit = defineEmits<{ close: [] }>()
const taggerStore = useTaggerStore()
const appStore = useAppStore()

const query = ref('')
const renameTarget = ref('')
const newTag = ref('')
const newTagPosition = ref<'first' | 'last'>('last')
const savingAll = ref(false)

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = taggerStore.queueInventory
  return q ? list.filter((row) => row.tag.toLowerCase().includes(q)) : list
})
const total = computed(() => taggerStore.queue.length)
const selected = computed(() => taggerStore.highlightTag)
const selectedRow = computed(() => taggerStore.queueInventory.find((row) => row.tag.toLowerCase() === selected.value.toLowerCase()))
const editedCount = computed(() => taggerStore.queue.filter((item) => item.status === 'ready' || item.status === 'partial' || item.status === 'failed').length)

watch(selected, () => { renameTarget.value = '' })

function pick(tag: string) {
  taggerStore.highlightTag = taggerStore.highlightTag === tag ? '' : tag
}

function renameSelected() {
  const from = selected.value
  const to = renameTarget.value.trim()
  if (!from || !to) return
  const changed = taggerStore.renameTagAcrossQueue(from, to)
  appStore.setStatus(changed ? `「${from}」→「${to}」：改了 ${changed} 张` : '没有需要改的图片')
  taggerStore.highlightTag = to
  renameTarget.value = ''
}

function removeSelected() {
  const name = selected.value
  if (!name) return
  const changed = taggerStore.removeTagAcrossQueue(name)
  appStore.setStatus(changed ? `已从 ${changed} 张图片移除「${name}」` : '没有需要改的图片')
  taggerStore.highlightTag = ''
}

function addToAll() {
  const name = newTag.value.trim()
  if (!name) return
  const changed = taggerStore.addTagToAll(name, newTagPosition.value)
  appStore.setStatus(changed ? `已给 ${changed} 张图片加上「${name}」` : '所有图片都已经有这个标签了')
  newTag.value = ''
  taggerStore.highlightTag = name
}

async function saveAll() {
  savingAll.value = true
  try {
    const result = await taggerStore.saveAllEdited()
    appStore.setStatus(`已保存 ${result.saved} 张${result.failed ? `，${result.failed} 张失败` : ''}`)
  } finally {
    savingAll.value = false
  }
}
</script>

<template>
  <aside class="inventory" aria-label="全部标签">
    <header>
      <div><strong>全部标签</strong><small>{{ taggerStore.queueInventory.length }} 个 · 队列 {{ total }} 张</small></div>
      <button type="button" class="inventory__close" aria-label="关闭" @click="emit('close')">×</button>
    </header>

    <label class="inventory__search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input v-model="query" placeholder="筛选标签" />
    </label>

    <div class="inventory__list" role="listbox" aria-label="标签清单">
      <button
        v-for="row in rows"
        :key="row.tag"
        type="button"
        role="option"
        class="inventory__row"
        :class="{ active: selected.toLowerCase() === row.tag.toLowerCase() }"
        :aria-selected="selected.toLowerCase() === row.tag.toLowerCase()"
        @click="pick(row.tag)"
      >
        <span class="inventory__name">{{ row.tag }}</span>
        <span class="inventory__bar" :style="{ '--w': `${Math.round((row.count / Math.max(1, total)) * 100)}%` }"></span>
        <b>{{ row.count }}</b>
      </button>
      <p v-if="!rows.length" class="inventory__empty">{{ taggerStore.queueInventory.length ? '没有匹配的标签' : '队列里还没有标签' }}</p>
    </div>

    <section v-if="selected" class="inventory__actions">
      <p><b>{{ selected }}</b> · {{ selectedRow?.count ?? 0 }} / {{ total }} 张有 · 点下方缩略图可逐张加减</p>
      <div class="inventory__rename">
        <input v-model="renameTarget" placeholder="整批改名为…" @keydown.enter.prevent="renameSelected" />
        <button type="button" :disabled="!renameTarget.trim()" @click="renameSelected">全部替换</button>
      </div>
      <div class="inventory__row-actions">
        <button type="button" class="danger" @click="removeSelected">从全部图片移除</button>
        <button type="button" @click="taggerStore.highlightTag = ''">退出校对</button>
      </div>
    </section>

    <section class="inventory__add">
      <div class="inventory__add-row">
        <input v-model="newTag" placeholder="给全部图片加一个标签" @keydown.enter.prevent="addToAll" />
        <select v-model="newTagPosition" aria-label="位置"><option value="last">加到末尾</option><option value="first">加到开头</option></select>
        <button type="button" :disabled="!newTag.trim()" @click="addToAll">添加</button>
      </div>
    </section>

    <footer>
      <span>{{ editedCount ? `${editedCount} 张改动待保存` : '没有未保存的改动' }}</span>
      <button type="button" class="primary" :disabled="!editedCount || savingAll" @click="saveAll">{{ savingAll ? '保存中…' : '保存全部改动' }}</button>
    </footer>
  </aside>
</template>

<style scoped>
.inventory { width: 280px; flex: 0 0 280px; min-height: 0; display: flex; flex-direction: column; border-radius: 28px; background: var(--surface-primary); box-shadow: var(--surface-shadow); overflow: hidden; }
.inventory header { display: flex; align-items: center; justify-content: space-between; padding: 16px 14px 8px 18px; }
.inventory header strong { display: block; font-size: 15px; font-weight: 900; }
.inventory header small { color: var(--ink-tertiary); font: 10.5px var(--font-mono); }
.inventory__close { width: 28px; height: 28px; border: 0; border-radius: 50%; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font-size: 16px; line-height: 1; }
.inventory__search { display: flex; align-items: center; gap: 8px; margin: 4px 14px 8px; height: 34px; padding: 0 12px; border-radius: 999px; background: var(--surface-secondary); }
.inventory__search svg { width: 14px; height: 14px; stroke: var(--ink-tertiary); fill: none; stroke-width: 2; flex: none; }
.inventory__search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ink-primary); font: inherit; font-size: 12px; outline: none; }
.inventory__list { flex: 1; min-height: 120px; overflow: auto; padding: 0 10px 8px; display: flex; flex-direction: column; gap: 2px; }
.inventory__row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 7px 10px; border: 0; border-radius: 12px; background: transparent; color: var(--ink-primary); font: inherit; text-align: left; cursor: pointer; overflow: hidden; }
.inventory__row:hover { background: var(--brand-tint); }
.inventory__row.active { background: var(--brand-primary); color: var(--brand-on-primary); }
.inventory__name { position: relative; z-index: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
.inventory__row b { position: relative; z-index: 1; font: 11px var(--font-mono); font-weight: 700; opacity: .85; }
.inventory__bar { position: absolute; left: 0; top: 0; bottom: 0; width: var(--w, 0); background: var(--brand-soft); opacity: .55; pointer-events: none; }
.inventory__row.active .inventory__bar { background: rgba(255,255,255,.22); }
.inventory__empty { margin: 20px 8px; color: var(--ink-tertiary); font-size: 12px; text-align: center; }
.inventory__actions { margin: 0 14px 8px; padding: 10px 12px; border-radius: 16px; background: var(--accent-peach-soft); }
.inventory__actions p { margin: 0 0 8px; color: var(--accent-peach-strong); font-size: 11.5px; line-height: 1.5; }
.inventory__actions p b { font-weight: 900; }
.inventory__rename { display: flex; gap: 6px; }
.inventory__rename input, .inventory__add-row input { flex: 1; min-width: 0; height: 32px; padding: 0 12px; border: 1px solid transparent; border-radius: 999px; background: var(--surface-primary); color: var(--ink-primary); font: inherit; font-size: 12px; outline: none; }
.inventory__rename input:focus, .inventory__add-row input:focus { border-color: var(--brand-primary); }
.inventory__rename button, .inventory__row-actions button, .inventory__add-row button, .inventory__add-row select { height: 32px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--surface-primary); color: var(--ink-secondary); font: inherit; font-size: 11.5px; font-weight: 800; cursor: pointer; }
.inventory__rename button:disabled, .inventory__add-row button:disabled { opacity: .4; cursor: not-allowed; }
.inventory__row-actions { display: flex; gap: 6px; margin-top: 6px; }
.inventory__row-actions .danger { color: var(--danger-foreground); }
.inventory__add { margin: 0 14px 10px; }
.inventory__add-row { display: flex; gap: 6px; }
.inventory__add-row input { background: var(--surface-secondary); }
.inventory__add-row select { background: var(--surface-secondary); padding-right: 10px; }
.inventory footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px 14px; border-top: 1px solid var(--line-subtle); color: var(--ink-tertiary); font-size: 11px; }
.inventory footer .primary { height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--brand-gradient); color: var(--brand-on-primary); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.inventory footer .primary:disabled { opacity: .4; cursor: not-allowed; }
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { setGallerySortMode } from '@/stores/gallery-sort'

defineProps<{
  title: string
  search: string
  tagState: 'all' | 'tagged' | 'untagged'
  sort: string
  viewMode: 'small' | 'large' | 'list'
  imageCount: number
  scanning: boolean
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:tagState': [value: 'all' | 'tagged' | 'untagged']
  'update:sort': [value: string]
  'update:viewMode': [value: 'small' | 'large' | 'list']
  scan: []
  addRoot: []
  importImages: []
}>()

const importMenu = ref<HTMLElement | null>(null)
const importMenuOpen = ref(false)

async function onSortChange(event: Event) {
  const mode = (event.target as HTMLSelectElement).value
  emit('update:sort', mode)
  await setGallerySortMode(mode)
}

function chooseImages() {
  importMenuOpen.value = false
  emit('importImages')
}

function chooseFolder() {
  importMenuOpen.value = false
  emit('addRoot')
}

function closeImportMenu(event: MouseEvent) {
  if (!importMenu.value?.contains(event.target as Node)) importMenuOpen.value = false
}

onMounted(() => document.addEventListener('click', closeImportMenu))
onBeforeUnmount(() => {
  document.removeEventListener('click', closeImportMenu)
})
</script>

<template>
  <div class="gallery-toolbar">
    <div class="toolbar-title">
      <strong>{{ title }}</strong>
      <span>{{ imageCount }} 张</span>
    </div>
    <label class="search-box">
      <svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
      <input :value="search" title="空格 = 同时包含（AND） · | = 包含其一（OR） · - = 排除（NOT）" placeholder="搜索：空格=且，|=或，-=排除" @input="$emit('update:search', ($event.target as HTMLInputElement).value)" />
      <kbd>Ctrl K</kbd>
    </label>
    <select :value="tagState" @change="$emit('update:tagState', ($event.target as HTMLSelectElement).value as any)">
      <option value="all">全部状态</option><option value="tagged">已标注</option><option value="untagged">未标注</option>
    </select>
    <select :value="sort" @change="onSortChange">
      <option value="modified-desc">最近修改</option><option value="name-asc">名称升序</option><option value="name-desc">名称降序</option>
    </select>
    <div class="view-switch" aria-label="视图方式">
      <button :class="{ active: viewMode === 'small' }" title="小网格" @click="$emit('update:viewMode', 'small')">▦</button>
      <button :class="{ active: viewMode === 'large' }" title="大网格" @click="$emit('update:viewMode', 'large')">▥</button>
      <button :class="{ active: viewMode === 'list' }" title="列表" @click="$emit('update:viewMode', 'list')">☷</button>
    </div>
    <span class="toolbar-divider"></span>
    <button class="toolbar-action" :disabled="scanning" @click="$emit('scan')">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 7a6.5 6.5 0 1 0 .1 5"/><path d="M16 3v4h-4"/></svg>
      {{ scanning ? '同步中' : '同步' }}
    </button>
    <div ref="importMenu" class="import-menu">
      <button class="toolbar-action toolbar-action--primary" aria-label="导入" :aria-expanded="importMenuOpen" @click.stop="importMenuOpen = !importMenuOpen">
        <span class="toolbar-action__icon" aria-hidden="true">＋</span>
        <span class="toolbar-action__label">导入</span>
        <span class="toolbar-action__chevron" aria-hidden="true">⌄</span>
      </button>
      <div v-if="importMenuOpen" class="import-menu__popup">
        <button @click="chooseImages"><strong>选择图片</strong><span>可多选，并在系统窗口中预览</span></button>
        <button @click="chooseFolder"><strong>选择文件夹</strong><span>同步文件夹内的全部图片</span></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery-toolbar { height: 44px; flex: 0 0 44px; min-width: 0; display: flex; align-items: center; gap: 7px; margin-bottom: 10px; padding: 0 10px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--surface-secondary) 72%, transparent); white-space: nowrap; }
.toolbar-title { min-width: 118px; max-width: 190px; display: flex; align-items: baseline; gap: 7px; overflow: hidden; }
.toolbar-title strong { overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); font-size: 12px; font-weight: 680; }
.toolbar-title span { flex: none; color: var(--text-tertiary); font-size: 9px; }
.search-box { flex: 1; min-width: 120px; max-width: 360px; height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 9px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.025); }
.search-box:focus-within { border-color: rgba(var(--accent-primary-rgb),.5); background: rgba(255,255,255,.04); }
.search-box svg { width: 15px; fill: none; stroke: var(--text-tertiary); stroke-width: 1.5; }
.search-box input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 11px; }
.search-box kbd { padding: 2px 5px; border: 1px solid rgba(255,255,255,.08); border-radius: 4px; color: var(--text-tertiary); font: 8px/1.4 ui-monospace, monospace; }
select { height: 30px; max-width: 114px; padding: 0 25px 0 9px; border: 1px solid rgba(255,255,255,.07); border-radius: 8px; background: rgba(255,255,255,.025); color: var(--text-secondary); font: inherit; font-size: 9px; outline: none; }
.view-switch { display: flex; padding: 2px; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; background: rgba(255,255,255,.02); }
.view-switch button { width: 26px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--text-tertiary); cursor: pointer; }
.view-switch button.active { background: rgba(var(--accent-primary-rgb),.13); color: var(--accent-primary); }
.toolbar-divider { width: 1px; height: 20px; background: rgba(255,255,255,.07); }
.toolbar-action { height: 30px; display: flex; align-items: center; gap: 4px; padding: 0 9px; border: 1px solid rgba(255,255,255,.075); border-radius: 8px; background: rgba(255,255,255,.025); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 9px; }
.toolbar-action svg { width: 13px; fill: none; stroke: currentColor; stroke-width: 1.5; }
.toolbar-action--primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
.toolbar-action__icon { flex: none; font-size: 12px; line-height: 1; }
.toolbar-action__chevron { margin-left: 1px; font-size: 10px; }
.toolbar-action:disabled { opacity: .5; cursor: wait; }
.import-menu { position: relative; }
.import-menu__popup { position: absolute; z-index: 50; top: calc(100% + 6px); right: 0; width: 210px; padding: 5px; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: #211e26; box-shadow: 0 16px 40px rgba(0,0,0,.34); }
.import-menu__popup button { width: 100%; display: grid; gap: 2px; padding: 9px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--text-secondary); text-align: left; cursor: pointer; }
.import-menu__popup button:hover { background: rgba(var(--accent-primary-rgb),.1); }
.import-menu__popup strong { font-size: 10px; }
.import-menu__popup span { color: var(--text-tertiary); font-size: 8px; }
@media (max-width: 980px) { .search-box kbd, .toolbar-title span, .toolbar-divider { display: none; }.toolbar-title { min-width: 86px; }.toolbar-action:not(.toolbar-action--primary) { width: 30px; padding: 0; justify-content: center; font-size: 0; } select { max-width: 104px; } }
@media (max-width: 760px) { .toolbar-title { min-width: 68px; }.gallery-toolbar select:nth-of-type(2), .view-switch { display: none; }.toolbar-action--primary { width: 30px; overflow: hidden; padding: 0; justify-content: center; }.toolbar-action__label { display: none; }.toolbar-action__chevron { display: none; }.toolbar-action__icon { font-size: 12px; line-height: 1; } }
</style>

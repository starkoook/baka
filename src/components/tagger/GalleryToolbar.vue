<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

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
    </label>
    <select :value="tagState" @change="$emit('update:tagState', ($event.target as HTMLSelectElement).value as any)">
      <option value="all">全部状态</option><option value="tagged">已标注</option><option value="untagged">未标注</option>
    </select>
    <select :value="sort" @change="$emit('update:sort', ($event.target as HTMLSelectElement).value)">
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
.gallery-toolbar { height: 50px; flex: 0 0 50px; min-width: 0; display: flex; align-items: center; gap: 8px; margin: 0 4px 12px; padding: 0 8px 0 16px; border: 0; border-radius: var(--radius-pill); background: var(--surface-primary); box-shadow: var(--surface-shadow); white-space: nowrap; }
.toolbar-title { min-width: 118px; max-width: 190px; display: flex; align-items: baseline; gap: 7px; overflow: hidden; }
.toolbar-title strong { overflow: hidden; text-overflow: ellipsis; color: var(--ink-primary); font-size: 14px; font-weight: 900; }
.toolbar-title span { flex: none; color: var(--ink-tertiary); font-family: var(--font-mono); font-size: 10.5px; }
.search-box { flex: 1; min-width: 120px; max-width: 360px; height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid transparent; border-radius: var(--radius-pill); background: var(--surface-secondary); transition: border-color 140ms ease, box-shadow 140ms ease; }
.search-box:focus-within { border-color: var(--brand-primary); box-shadow: 0 0 0 4px var(--brand-soft); background: var(--surface-primary); }
.search-box svg { width: 15px; fill: none; stroke: var(--ink-tertiary); stroke-width: 1.8; }
.search-box input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--ink-primary); font: inherit; font-size: 12px; }
.search-box input::placeholder { color: var(--ink-tertiary); }
select { height: 34px; max-width: 124px; padding: 0 28px 0 12px; border: 0; border-radius: var(--radius-pill); background: var(--surface-secondary) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23ad8f9f' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center; color: var(--ink-secondary); font: inherit; font-size: 12px; font-weight: 700; outline: none; appearance: none; cursor: pointer; }
.view-switch { display: flex; padding: 3px; border-radius: var(--radius-pill); background: var(--surface-secondary); }
.view-switch button { width: 30px; height: 28px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--ink-tertiary); cursor: pointer; font-size: 13px; }
.view-switch button.active { background: var(--surface-primary); color: var(--brand-hover); box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), .18); }
.toolbar-divider { width: 1px; height: 22px; background: var(--line-subtle); }
.toolbar-action { height: 34px; display: flex; align-items: center; gap: 5px; padding: 0 14px; border: 0; border-radius: var(--radius-pill); background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; transition: background-color 140ms ease, color 140ms ease, transform 160ms var(--ease-bounce); }
.toolbar-action:hover { background: var(--brand-soft); color: var(--brand-hover); }
.toolbar-action:active { transform: scale(.96); }
.toolbar-action svg { width: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.toolbar-action--primary { background: var(--brand-gradient); color: var(--brand-on-primary); box-shadow: 0 10px 22px rgba(var(--brand-primary-rgb), .32); }
.toolbar-action--primary:hover { color: #fff; }
.toolbar-action__icon { flex: none; font-size: 13px; line-height: 1; }
.toolbar-action__chevron { margin-left: 1px; font-size: 10px; }
.toolbar-action:disabled { opacity: .5; cursor: wait; }
.import-menu { position: relative; }
.import-menu__popup { position: absolute; z-index: 50; top: calc(100% + 8px); right: 0; width: 230px; padding: 6px; border: 0; border-radius: 20px; background: var(--surface-primary); box-shadow: var(--surface-shadow-lg); }
.import-menu__popup button { width: 100%; display: grid; gap: 2px; padding: 10px 12px; border: 0; border-radius: 14px; background: transparent; color: var(--ink-secondary); text-align: left; cursor: pointer; font: inherit; }
.import-menu__popup button:hover { background: var(--brand-tint); }
.import-menu__popup strong { font-size: 12.5px; color: var(--ink-primary); }
.import-menu__popup span { color: var(--ink-tertiary); font-size: 10.5px; }
@media (max-width: 980px) { .toolbar-title span, .toolbar-divider { display: none; }.toolbar-title { min-width: 86px; }.toolbar-action:not(.toolbar-action--primary) { width: 34px; padding: 0; justify-content: center; font-size: 0; } select { max-width: 104px; } }
@media (max-width: 760px) { .toolbar-title { min-width: 68px; }.gallery-toolbar select:nth-of-type(2), .view-switch { display: none; }.toolbar-action--primary { width: 34px; overflow: hidden; padding: 0; justify-content: center; }.toolbar-action__label { display: none; }.toolbar-action__chevron { display: none; }.toolbar-action__icon { font-size: 13px; line-height: 1; } }
</style>

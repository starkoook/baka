<script setup lang="ts">
defineProps<{
  title: string
  search: string
  tagState: 'all' | 'tagged' | 'untagged'
  sort: string
  viewMode: 'small' | 'large' | 'list'
  imageCount: number
  scanning: boolean
}>()

defineEmits<{
  'update:search': [value: string]
  'update:tagState': [value: 'all' | 'tagged' | 'untagged']
  'update:sort': [value: string]
  'update:viewMode': [value: 'small' | 'large' | 'list']
  scan: []
  addRoot: []
}>()
</script>

<template>
  <div class="gallery-toolbar">
    <div class="toolbar-title">
      <strong>{{ title }}</strong>
      <span>{{ imageCount }} 张</span>
    </div>
    <label class="search-box">
      <svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
      <input :value="search" placeholder="搜索文件名或标签" @input="$emit('update:search', ($event.target as HTMLInputElement).value)" />
      <kbd>Ctrl K</kbd>
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
    <button class="toolbar-action toolbar-action--primary" @click="$emit('addRoot')">＋ 添加文件夹</button>
  </div>
</template>

<style scoped>
.gallery-toolbar { height: 44px; flex: 0 0 44px; min-width: 0; display: flex; align-items: center; gap: 7px; padding: 0 10px; border-bottom: 1px solid rgba(255,255,255,.065); white-space: nowrap; }
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
.toolbar-action:disabled { opacity: .5; cursor: wait; }
@media (max-width: 980px) { .search-box kbd, .toolbar-title span, .toolbar-divider { display: none; }.toolbar-title { min-width: 86px; }.toolbar-action:not(.toolbar-action--primary) { width: 30px; padding: 0; justify-content: center; font-size: 0; } select { max-width: 104px; } }
@media (max-width: 760px) { .toolbar-title { min-width: 68px; }.gallery-toolbar select:nth-of-type(2), .view-switch { display: none; }.toolbar-action--primary { width: 30px; overflow: hidden; padding: 0 7px; font-size: 0; }.toolbar-action--primary::first-letter { font-size: 12px; } }
</style>

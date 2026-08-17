<script setup lang="ts">
defineProps<{
  roots: LibraryRoot[]
  datasets: { name: string; folderPath: string; imagePaths: string[] }[]
  activeRootId: number | null | undefined
  activeDatasetId: string | null
}>()

defineEmits<{
  selectAll: []
  selectRoot: [root: LibraryRoot]
  selectDataset: [folderPath: string]
  importDataset: []
  createDataset: []
  openRecycle: []
}>()
</script>

<template>
  <aside class="gallery-sidebar">
    <div class="sidebar-scroll">
      <section>
        <div class="section-heading"><span>图片来源</span></div>
        <button class="source-row" :class="{ active: activeRootId === null && !activeDatasetId }" @click="$emit('selectAll')">
          <span class="source-icon"><svg viewBox="0 0 20 20"><rect x="2.5" y="3" width="15" height="14" rx="3"/><path d="m3 13 4-4 3 3 2-2 5 5"/></svg></span>
          <span>全部图片</span>
        </button>
        <button v-for="root in roots" :key="root.id" class="source-row" :class="{ active: activeRootId === root.id && !activeDatasetId }" @click="$emit('selectRoot', root)">
          <span class="source-icon"><svg viewBox="0 0 20 20"><path d="M2.5 5.5h6l1.5 2h7.5v8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><path d="M2.5 8h15"/></svg></span>
          <span class="source-name">{{ root.label }}</span>
          <small>{{ root.image_count ?? 0 }}</small>
        </button>
      </section>

      <section>
        <div class="section-heading"><span>快速查看</span></div>
        <button class="source-row source-row--muted"><span class="dot dot--new"></span><span>最近加入</span></button>
        <button class="source-row source-row--muted"><span class="dot dot--empty"></span><span>未标注</span></button>
      </section>

      <section>
        <div class="section-heading"><span>数据集</span><button title="新建数据集" @click="$emit('createDataset')">＋</button></div>
        <button v-for="dataset in datasets" :key="dataset.folderPath" class="source-row" :class="{ active: activeDatasetId === dataset.folderPath }" @click="$emit('selectDataset', dataset.folderPath)">
          <span class="source-icon"><svg viewBox="0 0 20 20"><path d="M4 4.5h12v12H4z"/><path d="M7 2.5h6M7 17.5h6"/></svg></span>
          <span class="source-name">{{ dataset.name }}</span>
          <small>{{ dataset.imagePaths.length }}</small>
        </button>
        <button v-if="datasets.length === 0" class="dataset-empty" @click="$emit('importDataset')">导入已有图片文件夹</button>
      </section>
    </div>
    <div class="sidebar-footer">
      <button class="recycle-button" @click="$emit('openRecycle')">
        <svg viewBox="0 0 20 20"><path d="M3 6h14M8 3h4l1 3H7zM5 6l1 11h8l1-11"/></svg>
        <span>回收站</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.gallery-sidebar { width: 198px; flex: 0 0 198px; min-height: 0; display: flex; flex-direction: column; border: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--surface-secondary) 78%, transparent), transparent); }
.sidebar-footer { flex: none; padding: 8px 10px 12px; border-top: 1px solid rgba(255,255,255,.06); }
.recycle-button { width: 100%; height: 38px; display: flex; align-items: center; gap: 9px; padding: 0 10px; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; background: rgba(255,255,255,.025); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 11px; }
.recycle-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.4; }
.recycle-button:hover { background: rgba(var(--accent-primary-rgb),.09); color: var(--accent-primary); }
.sidebar-scroll { flex: 1; min-height: 0; overflow: auto; padding: 10px; }
section + section { margin-top: 17px; }
.section-heading { height: 28px; display: flex; align-items: center; justify-content: space-between; padding: 0 8px; color: var(--text-tertiary); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.section-heading button { width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--text-tertiary); cursor: pointer; font-size: 17px; }
.section-heading button:hover { background: rgba(255,255,255,.06); color: var(--text-primary); }
.source-row { width: 100%; height: 34px; display: flex; align-items: center; gap: 9px; padding: 0 9px; border: 0; border-radius: 8px; background: transparent; color: var(--text-tertiary); cursor: pointer; text-align: left; font: inherit; font-size: 11px; }
.source-row:hover { background: rgba(255,255,255,.04); color: var(--text-secondary); }
.source-row.active { background: rgba(var(--accent-primary-rgb),.11); color: var(--accent-primary); }
.source-row small { margin-left: auto; color: inherit; opacity: .65; font-size: 9px; }
.source-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-icon { width: 17px; height: 17px; flex: none; }
.source-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.35; }
.source-row--muted { opacity: .75; }
.dot { width: 7px; height: 7px; margin: 0 5px; border-radius: 50%; }
.dot--new { background: #70d6ff; box-shadow: 0 0 8px rgba(112,214,255,.4); }
.dot--empty { border: 1px solid #ffc66d; }
.dataset-empty { width: calc(100% - 8px); margin: 2px 4px; padding: 9px; border: 1px dashed rgba(255,255,255,.1); border-radius: 8px; background: transparent; color: var(--text-tertiary); font-size: 10px; cursor: pointer; }
.dataset-empty:hover { border-color: rgba(var(--accent-primary-rgb),.4); color: var(--accent-primary); }
@media (max-width: 1200px) { .gallery-sidebar { width: 178px; flex-basis: 178px; } }
</style>

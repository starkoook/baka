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
.gallery-sidebar { width: 216px; flex: 0 0 216px; min-height: 0; display: flex; flex-direction: column; border-radius: var(--radius-hero); background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.sidebar-footer { flex: none; padding: 8px 12px 12px; }
.recycle-button { width: 100%; height: 40px; display: flex; align-items: center; gap: 9px; padding: 0 14px; border: 0; border-radius: var(--radius-pill); background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 700; transition: background-color 140ms ease, color 140ms ease; }
.recycle-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; }
.recycle-button:hover { background: var(--brand-soft); color: var(--brand-hover); }
.sidebar-scroll { flex: 1; min-height: 0; overflow: auto; padding: 14px 12px 8px; }
section + section { margin-top: 18px; }
.section-heading { height: 28px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; color: var(--ink-tertiary); font-size: 11px; font-weight: 800; letter-spacing: .06em; }
.section-heading button { width: 26px; height: 26px; border: 0; border-radius: 50%; background: transparent; color: var(--brand-hover); cursor: pointer; font-size: 17px; }
.section-heading button:hover { background: var(--brand-soft); }
.source-row { width: 100%; height: 38px; display: flex; align-items: center; gap: 9px; padding: 0 12px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--ink-secondary); cursor: pointer; text-align: left; font: inherit; font-size: 13px; font-weight: 600; transition: background-color 140ms ease, color 140ms ease, transform 180ms var(--ease-bounce); }
.source-row:hover { background: var(--brand-tint); color: var(--ink-primary); }
.source-row.active { background: var(--brand-primary); color: var(--brand-on-primary); box-shadow: 0 10px 22px rgba(var(--brand-primary-rgb), .3); }
.source-row small { margin-left: auto; color: inherit; opacity: .7; font-family: var(--font-mono); font-size: 10.5px; }
.source-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-icon { width: 17px; height: 17px; flex: none; }
.source-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.6; }
.source-row--muted { opacity: .8; }
.dot { width: 8px; height: 8px; margin: 0 5px; border-radius: 50%; }
.dot--new { background: var(--accent-sky); box-shadow: 0 0 0 3px var(--accent-sky-soft); }
.dot--empty { border: 2px solid var(--accent-peach); }
.dataset-empty { width: calc(100% - 8px); margin: 2px 4px; padding: 10px; border: 2px dashed var(--line-strong); border-radius: 16px; background: transparent; color: var(--ink-tertiary); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
.dataset-empty:hover { border-color: var(--brand-primary); color: var(--brand-hover); }
@media (max-width: 1200px) { .gallery-sidebar { width: 190px; flex-basis: 190px; } }
</style>

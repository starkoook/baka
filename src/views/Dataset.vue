<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useLogStore } from '@/stores/logs'

const appStore = useAppStore()
const logStore = useLogStore()

interface DatasetEntry { name: string; folderPath: string; addedAt: string }
interface FileItem { name: string; path: string; txtPath: string | null; caption: string; hasCaption: boolean; thumb?: string }

const DATASET_LIST_KEY = 'baka-datasets'
const datasets = ref<DatasetEntry[]>([])
const activeDataset = ref<DatasetEntry | null>(null)
const items = ref<FileItem[]>([])
const viewMode = ref<'grid' | 'table'>('grid')
const searchQuery = ref('')
const filterTag = ref('')
const selectedItem = ref<FileItem | null>(null)
const editCaption = ref('')
const saving = ref(false)
const showTagPanel = ref(true)

// Context menu
const ctxMenu = ref({ show: false, x: 0, y: 0, tag: '' })
const ctxReplace = ref('')

// Batch
const batchAddTag = ref(''); const batchRemoveTag = ref('')
const batchFind = ref(''); const batchReplace = ref('')

// Drag-over for empty state
const isDragOver = ref(false)

function loadDatasetList() {
  try { const r = localStorage.getItem(DATASET_LIST_KEY); if (r) datasets.value = JSON.parse(r) } catch { datasets.value = [] }
}
function saveDatasetList() { localStorage.setItem(DATASET_LIST_KEY, JSON.stringify(datasets.value)) }

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const ft = filterTag.value.trim().toLowerCase()
  return items.value.filter((i) => {
    const cap = i.caption.toLowerCase()
    if (q && !cap.includes(q) && !i.name.toLowerCase().includes(q)) return false
    if (ft && !cap.split(/[,，\n]/).map(t => t.trim().toLowerCase()).includes(ft)) return false
    return true
  })
})

const tagStats = computed(() => {
  const map = new Map<string, number>()
  for (const item of items.value) {
    if (!item.caption) continue
    item.caption.split(/[,，\n]/).forEach((t) => { const tag = t.trim(); if (tag) map.set(tag, (map.get(tag) || 0) + 1) })
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
})

// ── Import / Load ──
async function importDataset() {
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (!folder) return
  if (datasets.value.find((d) => d.folderPath === folder)) { logStore.warn('已存在'); loadDataset(datasets.value.find((d) => d.folderPath === folder)!); return }
  const entry: DatasetEntry = { name: folder.split(/[/\\]/).pop() || folder, folderPath: folder, addedAt: new Date().toISOString() }
  datasets.value.unshift(entry); saveDatasetList()
  loadDataset(entry)
}
async function loadDataset(ds: DatasetEntry) {
  activeDataset.value = ds; selectedItem.value = null; filterTag.value = ''; items.value = []
  const list = await window.fsAPI.listDataset(ds.folderPath); items.value = list
  appStore.setStatus(`已加载 ${list.length} 张图片`)
  loadThumbsBatch(0)
}
async function loadThumbsBatch(start: number) {
  const batch = items.value.slice(start, start + 6)
  for (const item of batch) { if (item.thumb) continue; try { const res = await window.fsAPI.readThumb(item.path); if (res.success) item.thumb = 'data:image/jpeg;base64,' + res.base64 } catch (_) {} }
  if (start + 6 < items.value.length) setTimeout(() => loadThumbsBatch(start + 6), 80)
}
function removeDataset(ds: DatasetEntry) {
  datasets.value = datasets.value.filter((d) => d.folderPath !== ds.folderPath); saveDatasetList()
  if (activeDataset.value?.folderPath === ds.folderPath) { activeDataset.value = null; items.value = [] }
}

// ── Edit ──
function editItem(item: FileItem) { selectedItem.value = item; editCaption.value = item.caption || '' }
async function saveCaption() {
  if (!selectedItem.value) return; const item = selectedItem.value
  if (!item.txtPath) { const base = item.name.replace(/\.[^.]+$/, ''); item.txtPath = item.path.replace(item.name, base + '.txt') }
  saving.value = true
  const res = await window.fsAPI.saveCaption({ txtPath: item.txtPath, caption: editCaption.value })
  if (res.success) { item.caption = editCaption.value; item.hasCaption = !!editCaption.value.trim() }
  saving.value = false
}
function deleteItem(item: FileItem) { items.value = items.value.filter(i => i.path !== item.path); if (selectedItem.value?.path === item.path) selectedItem.value = null }

// ── Batch ops ──
async function batchAddTagFn(tag: string) { if (!tag) return; let c = 0; for (const item of items.value) { if (!item.caption?.includes(tag)) { item.caption = item.caption ? item.caption + ', ' + tag : tag; item.hasCaption = true; if (!item.txtPath) { const b = item.name.replace(/\.[^.]+$/, ''); item.txtPath = item.path.replace(item.name, b + '.txt') }; await window.fsAPI.saveCaption({ txtPath: item.txtPath!, caption: item.caption }); c++ } }; logStore.success(`添加 "${tag}" → ${c} 个`) }
async function batchRemoveTagFn(tag: string) { if (!tag) return; let c = 0; for (const item of items.value) { if (!item.caption) continue; const tags = item.caption.split(/[,，\n]/).map((t) => t.trim()); if (tags.includes(tag)) { item.caption = tags.filter((t) => t !== tag).join(', '); await window.fsAPI.saveCaption({ txtPath: item.txtPath!, caption: item.caption }); c++ } }; logStore.success(`移除 "${tag}" → ${c} 个`) }
async function batchReplaceFn() { const f = batchFind.value.trim(); const r = batchReplace.value.trim(); if (!f) return; let c = 0; for (const item of items.value) { if (!item.caption?.includes(f)) continue; item.caption = item.caption.split(f).join(r); await window.fsAPI.saveCaption({ txtPath: item.txtPath!, caption: item.caption }); c++ }; logStore.success(`替换 "${f}" → "${r}" 在 ${c} 个`); batchFind.value = ''; batchReplace.value = '' }

// ── Tag panel ──
function clickTag(tag: string) { filterTag.value = filterTag.value === tag ? '' : tag }
function onTagCtx(e: MouseEvent, tag: string) { e.preventDefault(); ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, tag }; ctxReplace.value = '' }
function closeCtx() { ctxMenu.value.show = false }
function ctxDelete() { batchRemoveTagFn(ctxMenu.value.tag); closeCtx() }
function ctxReplaceTag() { const r = ctxReplace.value.trim(); if (!r) return; batchAddTagFn(r); batchRemoveTagFn(ctxMenu.value.tag); closeCtx() }

// ── New dataset ──
const newDsName = ref('')
const showNewDsInput = ref(false)
const newDsParentPath = ref('')

function startNewDataset() { showNewDsInput.value = true; newDsName.value = ''; newDsParentPath.value = '' }
async function pickNewDsPath() {
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (folder) newDsParentPath.value = folder
}
async function createNewDataset() {
  const name = newDsName.value.trim(); if (!name) return
  const parent = newDsParentPath.value.trim() || 'D:\\comfyUI\\数据集'
  const folderPath = parent + '\\' + name
  if (!window.fsAPI) return
  const res = await window.fsAPI.createFolder(folderPath)
  if (res.success) {
    const entry: DatasetEntry = { name, folderPath, addedAt: new Date().toISOString() }
    datasets.value.unshift(entry); saveDatasetList(); loadDataset(entry)
    showNewDsInput.value = false; newDsName.value = ''
    logStore.success(`已创建数据集: ${name}`)
  } else { logStore.error(res.error || '创建失败') }
}

// ── Drag files into empty dataset ──
async function onEmptyDrop(e: DragEvent) {
  e.preventDefault(); isDragOver.value = false
  if (!activeDataset.value || !window.fsAPI) return
  const files = e.dataTransfer?.files; if (!files?.length) return
  let copied = 0
  for (const file of files) {
    const dest = activeDataset.value.folderPath + '\\' + file.name
    try {
      // Read file as base64, then write via IPC
      const reader = new FileReader()
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await window.fsAPI.writeBase64({ filePath: dest, base64 })
      if (res.success) copied++
      else console.error('[Dataset] write failed:', dest, res.error)
    } catch (e: any) { console.error('[Dataset] drop error:', e.message) }
  }
  if (copied > 0) { loadDataset(activeDataset.value); logStore.success(`已添加 ${copied} 张图片`) }
}
async function browseAddImages() {
  if (!window.fsAPI || !activeDataset.value) return
  const src = await window.fsAPI.selectFolder()
  if (!src) return
  // Copy images from src to dataset
  const files = await window.fsAPI.listImages(src)
  let copied = 0
  for (const f of files) {
    const dest = activeDataset.value.folderPath + '\\' + f.name
    const r = await window.fsAPI.copyFile({ src: f.path, dest, destDir: activeDataset.value.folderPath })
    if (r.success) copied++
  }
  if (copied > 0) { loadDataset(activeDataset.value); logStore.success(`已添加 ${copied} 张图片`) }
}

// ── Quick jump to tagger ──
function jumpToTagger() {
  if (!activeDataset.value) return
  appStore.setStatus('跳转到标注...')
  // Store the path in a global place the tagger can read
  localStorage.setItem('baka-autoload-tagger', activeDataset.value.folderPath)
  window.location.hash = '#/gallery'
}

onMounted(() => { loadDatasetList(); document.addEventListener('click', closeCtx) })
</script>

<template>
  <div class="ds-page" @dragenter="onDragEnter" @dragleave="onDragLeave" @drop="onDragDrop" @dragover.prevent>
    <!-- Top bar -->
    <div class="ds-top glass-panel">
      <button class="ds-import-btn" @click="importDataset" title="导入已有数据集">📂</button>
      <input v-if="activeDataset" class="ds-search" v-model="searchQuery" placeholder="🔍 搜索..." />
      <span v-if="filterTag" class="ds-filter-badge" @click="filterTag = ''">🏷 {{ filterTag }} ✕</span>
      <div class="ds-view-toggle" v-if="activeDataset">
        <button :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'">⊞</button>
        <button :class="{ active: viewMode === 'table' }" @click="viewMode = 'table'">☰</button>
        <button :class="{ active: showTagPanel }" @click="showTagPanel = !showTagPanel">🏷</button>
      </div>
    </div>

    <div class="ds-body">
      <!-- Left: Dataset list -->
      <div class="ds-sidebar glass-panel">
        <div class="ds-side-header">
          <h3 class="ds-side-title">数据集</h3>
          <button class="ds-new-btn" @click="startNewDataset" title="新建数据集">＋</button>
        </div>
        <div class="ds-new-input" v-if="showNewDsInput">
          <input v-model="newDsName" placeholder="数据集名称..." @keyup.enter="createNewDataset" />
          <button class="ds-new-path-btn" @click="pickNewDsPath" :title="newDsParentPath || '点击选择父目录'">📁</button>
          <button class="ds-new-ok" @click="createNewDataset">✓</button>
          <button class="ds-new-cancel" @click="showNewDsInput = false">✕</button>
        </div>
        <div class="ds-new-path-hint" v-if="showNewDsInput && newDsParentPath">{{ newDsParentPath }}</div>
        <div class="ds-list" v-if="datasets.length > 0">
          <div v-for="ds in datasets" :key="ds.folderPath" class="ds-list-item" :class="{ active: activeDataset?.folderPath === ds.folderPath }" @click="loadDataset(ds)">
            <span class="ds-list-name">{{ ds.name }}</span>
            <span class="ds-list-del" @click.stop="removeDataset(ds)">✕</span>
          </div>
        </div>
        <div class="ds-empty-hint" v-else><p>暂无数据集</p></div>
        <div class="ds-list-info" v-if="activeDataset">{{ filteredItems.length }}/{{ items.length }} 张 · {{ tagStats.length }} 标签</div>
      </div>

      <!-- Tag panel -->
      <div class="ds-tagpanel glass-panel" v-if="activeDataset && showTagPanel">
        <h3 class="ds-side-title">标签看板</h3>
        <div class="ds-tagcloud">
          <div v-for="[tag, count] in tagStats.slice(0, 60)" :key="tag" class="ds-tc-item" :class="{ active: filterTag === tag }" @click="clickTag(tag)" @contextmenu="onTagCtx($event, tag)">
            <span class="ds-tc-name">{{ tag }}</span>
            <span class="ds-tc-count">{{ count }}</span>
          </div>
        </div>
      </div>

      <!-- Main -->
      <div class="ds-main">
        <div class="ds-placeholder" v-if="!activeDataset" :class="{ dragover: isDragOver }">
          <div class="ph-dropzone">
            <span class="ph-icon">{{ isDragOver ? '📥' : '📁' }}</span>
            <p>{{ isDragOver ? '放手即可导入！' : '导入训练集开始处理' }}</p>
            <p class="ph-hint" @click="importDataset">或点击此处选择文件夹</p>
          </div>
        </div>

        <!-- Empty dataset drop zone -->
        <div class="ds-empty-drop" v-else-if="items.length === 0"
          @drop="onEmptyDrop" @dragover.prevent @dragenter="isDragOver = true" @dragleave="isDragOver = false"
          :class="{ dragover: isDragOver }">
          <div class="empty-drop-zone">
            <span class="ph-icon">{{ isDragOver ? '📥' : '📂' }}</span>
            <p>这是一个全新的空数据集</p>
            <p class="ph-sub">把素材图片直接拖到这里添加</p>
            <div class="empty-actions">
              <button class="empty-act-btn" @click="browseAddImages">🖼 浏览本地图片添加</button>
              <button class="empty-act-btn primary" @click="jumpToTagger">⚡ 直接跳转图像标注</button>
            </div>
          </div>
        </div>

        <template v-else>
          <!-- Quick tagger button -->
          <div class="ds-quick-bar" v-if="items.length > 0">
            <button class="ds-quick-tagger" @click="jumpToTagger">⚡ 去标注</button>
            <span class="ds-quick-info">{{ items.filter(i => !i.hasCaption).length }} 张未打标</span>
          </div>
          <!-- Grid (with drop support) -->
          <div class="ds-grid" v-if="viewMode === 'grid'"
            @drop="onEmptyDrop" @dragover.prevent @dragenter="isDragOver = true" @dragleave="isDragOver = false"
            :class="{ dragover: isDragOver }">
            <div v-for="item in filteredItems" :key="item.path" class="ds-card" :class="{ active: selectedItem?.path === item.path, nocap: !item.hasCaption }" @click="editItem(item)">
              <div class="ds-card-img">
                <img v-if="item.thumb" :src="item.thumb" /><span v-else class="ds-thumb-ph">🖼</span>
                <div class="ds-card-hover">
                  <button class="ds-hover-btn" @click.stop="editItem(item)" title="编辑">✏️</button>
                  <button class="ds-hover-btn del" @click.stop="deleteItem(item)" title="移除">🗑</button>
                </div>
              </div>
              <div class="ds-card-name">{{ item.name }}</div>
              <div class="ds-card-tags" v-if="item.caption">
                <span v-for="(t, ti) in item.caption.split(/[,，]/).slice(0, 4)" :key="ti" class="ds-tag">{{ t.trim() }}</span>
              </div>
            </div>
          </div>

          <!-- Table -->
          <div class="ds-table" v-if="viewMode === 'table'">
            <div v-for="item in filteredItems" :key="item.path" class="ds-row" :class="{ active: selectedItem?.path === item.path }" @click="editItem(item)">
              <div class="ds-row-thumb"><img v-if="item.thumb" :src="item.thumb" /><span v-else>🖼</span></div>
              <span class="ds-row-name">{{ item.name }}</span>
              <span class="ds-row-tags">{{ item.caption || '—' }}</span>
            </div>
          </div>

        </template>
      </div>

      <!-- Editor -->
      <div class="ds-editor glass-panel" v-if="selectedItem">
        <div class="ds-editor-header"><span class="ds-editor-name">{{ selectedItem.name }}</span><button class="ds-editor-close" @click="selectedItem = null">✕</button></div>
        <div class="ds-editor-preview" v-if="selectedItem.thumb"><img :src="selectedItem.thumb" /></div>
        <textarea class="ds-editor-area" v-model="editCaption" rows="6" placeholder="标签，逗号分隔..."></textarea>
        <div class="ds-editor-info">{{ editCaption.split(/[,，]/).filter(t => t.trim()).length }} 个标签</div>
        <button class="ds-save-btn" @click="saveCaption" :disabled="saving">💾 保存</button>
      </div>
    </div>

    <!-- Context menu -->
    <div class="ds-ctx" v-if="ctxMenu.show" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
      <div class="ds-ctx-item" @click="ctxDelete">🗑 全局删除 "{{ ctxMenu.tag }}"</div>
      <div class="ds-ctx-div"></div>
      <div class="ds-ctx-replace">
        <input v-model="ctxReplace" placeholder="替换为..." @keyup.enter="ctxReplaceTag" />
        <button @click="ctxReplaceTag">🔄 替换</button>
      </div>
    </div>

    <!-- Batch bar -->
    <div class="ds-batch glass-panel" v-if="activeDataset">
      <div class="ds-batch-group"><input v-model="batchAddTag" placeholder="添加标签..." @keyup.enter="batchAddTagFn(batchAddTag)" /><button @click="batchAddTagFn(batchAddTag)">➕</button></div>
      <div class="ds-batch-group"><input v-model="batchRemoveTag" placeholder="删除标签..." @keyup.enter="batchRemoveTagFn(batchRemoveTag)" /><button class="danger" @click="batchRemoveTagFn(batchRemoveTag)">➖</button></div>
      <div class="ds-batch-group"><input v-model="batchFind" placeholder="查找" /><input v-model="batchReplace" placeholder="替换" /><button @click="batchReplaceFn">🔄</button></div>
    </div>
  </div>
</template>

<style scoped>
.ds-page { max-width: 1600px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; height: calc(100vh - 100px); overflow: hidden; }

/* Top */
.ds-top { display: flex; align-items: center; gap: 10px; padding: 8px 14px; flex-shrink: 0; }
.ds-import-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--glass-border); border-radius: 50%; background: var(--glass-bg); color: var(--text-secondary); font-size: 16px; cursor: pointer; flex-shrink: 0; transition: all 0.2s; }
.ds-import-btn:hover { background: var(--accent-bg); border-color: var(--border-accent); color: var(--accent-primary); }
.ds-search { flex: 1; padding: 8px 14px; border-radius: var(--radius-full); border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-primary); font-size: 12px; font-family: var(--font-sans); max-width: 200px; }
.ds-search:focus { outline: none; border-color: var(--border-accent); }
.ds-filter-badge { padding: 4px 12px; border-radius: var(--radius-full); background: var(--accent-bg); color: var(--accent-primary); font-size: 11px; cursor: pointer; white-space: nowrap; }
.ds-view-toggle { display: flex; gap: 4px; margin-left: auto; }
.ds-view-toggle button { padding: 6px 12px; border: 1px solid var(--glass-border); border-radius: var(--radius-full); background: var(--glass-bg); color: var(--text-tertiary); font-size: 12px; font-family: var(--font-sans); cursor: pointer; transition: all 0.15s; }
.ds-view-toggle button.active { background: var(--accent-bg); border-color: var(--border-accent); color: var(--accent-primary); }

/* Body */
.ds-body { display: grid; grid-template-columns: 170px 180px 1fr 280px; gap: 10px; flex: 1; min-height: 0; overflow: hidden; }
.ds-body:has(.ds-tagpanel ~ .ds-main:only-child) { grid-template-columns: 170px 1fr 280px; }

/* Sidebar */
.ds-sidebar { padding: 12px; display: flex; flex-direction: column; overflow-y: auto; }
.ds-side-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.ds-side-title { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }
.ds-new-btn { width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-tertiary); font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.ds-new-btn:hover { background: var(--accent-bg); border-color: var(--border-accent); color: var(--accent-primary); }
.ds-new-input { display: flex; gap: 4px; margin-bottom: 4px; }
.ds-new-input input { flex: 1; padding: 5px 8px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-primary); font-size: 11px; font-family: var(--font-sans); }
.ds-new-input button { padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); cursor: pointer; font-size: 12px; }
.ds-new-path-btn { flex-shrink: 0; }
.ds-new-path-btn:hover { color: var(--accent-primary); border-color: var(--border-accent); }
.ds-new-ok:hover { background: rgba(52,211,153,0.15); border-color: #34d399; color: #34d399; }
.ds-new-cancel:hover { background: rgba(239,68,68,0.15); border-color: #ef4444; color: #ef4444; }
.ds-new-path-hint { font-size: 9px; color: var(--text-tertiary); padding: 0 4px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-list { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.ds-list-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; color: var(--text-secondary); transition: all 0.15s; }
.ds-list-item:hover { background: var(--glass-bg); }
.ds-list-item.active { background: var(--accent-bg); color: var(--accent-primary); font-weight: 600; }
.ds-list-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-list-del { font-size: 10px; color: var(--text-tertiary); padding: 2px 6px; border-radius: 50%; opacity: 0; transition: all 0.15s; }
.ds-list-item:hover .ds-list-del { opacity: 1; }
.ds-list-del:hover { background: rgba(239,68,68,0.2); color: #ef4444; }
.ds-empty-hint { font-size: 12px; color: var(--text-tertiary); text-align: center; padding: 20px 0; }
.ds-list-info { font-size: 10px; color: var(--text-tertiary); padding-top: 8px; border-top: 1px solid var(--border-subtle); margin-top: 8px; }

/* Tag panel */
.ds-tagpanel { padding: 12px; overflow-y: auto; }
.ds-tagcloud { display: flex; flex-direction: column; gap: 1px; }
.ds-tc-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 8px; border-radius: var(--radius-sm); cursor: pointer;
  font-size: 11px; transition: all 0.2s ease;
  border: 1px solid transparent;
  position: relative; overflow: hidden;
}
.ds-tc-item::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.06), rgba(var(--accent-secondary-rgb), 0.02));
  opacity: 0; transition: opacity 0.2s;
}
.ds-tc-item:hover { background: var(--glass-bg-hover); border-color: var(--glass-border); transform: translateX(3px); }
.ds-tc-item:hover::before { opacity: 1; }
.ds-tc-item.active {
  background: linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.15), rgba(var(--accent-secondary-rgb), 0.06));
  border-color: rgba(var(--accent-primary-rgb), 0.35);
  color: var(--accent-primary);
  font-weight: 600;
  box-shadow: 0 0 12px rgba(var(--accent-primary-rgb), 0.1), inset 0 0 0 1px rgba(var(--accent-primary-rgb), 0.08);
  transform: translateX(2px);
}
.ds-tc-item.active::before { opacity: 1; }
.ds-tc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; z-index: 1; }
.ds-tc-count {
  color: var(--text-tertiary); font-family: var(--font-mono); font-size: 10px;
  padding: 1px 6px; border-radius: var(--radius-full);
  background: rgba(255,255,255,0.04);
  transition: all 0.2s; position: relative; z-index: 1;
}
.ds-tc-item.active .ds-tc-count { background: rgba(var(--accent-primary-rgb), 0.15); color: var(--accent-primary); }
.ds-tc-item:hover .ds-tc-count { background: rgba(255,255,255,0.06); }

/* Main */
.ds-main { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 8px; }
.ds-grid { flex: 1; min-height: 0; display: flex; flex-direction: row; flex-wrap: wrap; gap: 10px; padding: 2px; overflow-y: auto; align-content: flex-start; transition: all 0.2s; }
.ds-grid.dragover { background: rgba(var(--accent-primary-rgb), 0.04); border-radius: var(--radius-sm); box-shadow: inset 0 0 0 2px rgba(var(--accent-primary-rgb), 0.15); }
.ds-card { width: 170px; flex-shrink: 0; flex-grow: 0; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--radius-md); overflow: hidden; cursor: pointer; transition: all 0.2s; }
.ds-card:hover { border-color: var(--border-accent); transform: translateY(-2px); }
.ds-card.active { border-color: var(--border-accent); box-shadow: var(--shadow-glow); }
.ds-card.nocap { opacity: 0.55; }
.ds-card-img { width: 170px; height: 170px; overflow: hidden; background: rgba(0,0,0,0.15); position: relative; }
.ds-card-img img { width: 100%; height: 100%; object-fit: cover; }
.ds-thumb-ph { font-size: 28px; opacity: 0.3; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }

/* Hover actions */
.ds-card-hover { position: absolute; top: 6px; right: 6px; display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s; }
.ds-card:hover .ds-card-hover { opacity: 1; }
.ds-hover-btn { width: 28px; height: 28px; border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: #fff; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
.ds-hover-btn.del:hover { background: rgba(239,68,68,0.8); }

.ds-card-name { padding: 5px 8px 0; font-size: 10px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-card-tags { padding: 3px 8px 6px; display: flex; flex-wrap: wrap; gap: 2px; }
.ds-tag { font-size: 9px; padding: 1px 6px; border-radius: var(--radius-full); background: var(--accent-bg); color: var(--accent-primary); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Table */
.ds-table { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.ds-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--glass-bg); border-radius: var(--radius-sm); cursor: pointer; }
.ds-row:hover { background: var(--glass-bg-hover); }
.ds-row.active { background: var(--accent-bg); }
.ds-row-thumb { width: 40px; height: 40px; border-radius: var(--radius-xs); overflow: hidden; background: rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ds-row-thumb img { width: 100%; height: 100%; object-fit: cover; }
.ds-row-name { font-size: 12px; color: var(--text-secondary); width: 160px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-row-tags { font-size: 11px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Stats */
.ds-stats { padding: 8px 12px; flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.ds-stat-tag { padding: 2px 8px; border-radius: var(--radius-full); background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--text-secondary); cursor: pointer; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
.ds-stat-tag:hover, .ds-stat-tag.active { border-color: var(--border-accent); background: var(--accent-bg); }
.ds-stat-tag em { font-style: normal; font-size: 10px; color: var(--text-tertiary); }

/* Editor */
.ds-editor { padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.ds-editor-header { display: flex; justify-content: space-between; align-items: center; }
.ds-editor-name { font-size: 12px; font-weight: 600; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-editor-close { background: none; border: none; color: var(--text-tertiary); cursor: pointer; font-size: 14px; }
.ds-editor-preview { border-radius: var(--radius-sm); overflow: hidden; background: rgba(0,0,0,0.15); }
.ds-editor-preview img { width: 100%; object-fit: contain; }
.ds-editor-area { width: 100%; padding: 10px; border-radius: var(--radius-sm); background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); color: var(--text-primary); font-family: var(--font-sans); font-size: 12px; resize: vertical; line-height: 1.7; flex: 1; min-height: 100px; }
.ds-editor-area:focus { outline: none; border-color: var(--border-accent); }
.ds-editor-info { font-size: 10px; color: var(--text-tertiary); }
.ds-save-btn { width: 100%; padding: 10px; border: none; border-radius: var(--radius-full); background: var(--gradient-accent); color: #fff; font-size: 13px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; }
.ds-save-btn:disabled { opacity: 0.4; }

/* Placeholder / Drop zone */
.ds-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; }
.ph-dropzone { display: flex; flex-direction: column; align-items: center; padding: 80px 40px; border: 2px dashed rgba(var(--accent-primary-rgb), 0.2); border-radius: var(--radius-xl); animation: breathe 3s ease-in-out infinite; }
.ds-placeholder.dragover .ph-dropzone { border-color: var(--accent-primary); background: var(--accent-bg); animation: none; box-shadow: 0 0 40px rgba(var(--accent-primary-rgb), 0.2); }
@keyframes breathe { 0%,100% { border-color: rgba(var(--accent-primary-rgb), 0.15); } 50% { border-color: rgba(var(--accent-primary-rgb), 0.35); } }
.ph-icon { font-size: 48px; opacity: 0.4; margin-bottom: 12px; }
.ph-hint { font-size: 12px; color: var(--text-tertiary); margin-top: 8px; cursor: pointer; text-decoration: underline; }

/* Empty dataset drop */
.ds-empty-drop { flex: 1; display: flex; align-items: center; justify-content: center; }
.empty-drop-zone { display: flex; flex-direction: column; align-items: center; padding: 60px 40px; border: 2px dashed rgba(var(--accent-primary-rgb), 0.2); border-radius: var(--radius-xl); text-align: center; transition: all 0.3s; }
.ds-empty-drop.dragover .empty-drop-zone { border-color: var(--accent-primary); background: var(--accent-bg); box-shadow: 0 0 40px rgba(var(--accent-primary-rgb), 0.15); }
.ph-sub { font-size: 13px; color: var(--text-tertiary); margin-top: 4px; }
.empty-actions { display: flex; gap: 10px; margin-top: 20px; }
.empty-act-btn { padding: 10px 18px; border-radius: var(--radius-full); border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 13px; font-family: var(--font-sans); cursor: pointer; transition: all 0.2s; }
.empty-act-btn:hover { background: var(--glass-bg-hover); border-color: var(--border-accent); }
.empty-act-btn.primary { background: var(--gradient-accent); color: #fff; border: none; }
.empty-act-btn.primary:hover { transform: scale(1.03); }

/* Quick tagger bar */
.ds-quick-bar { display: flex; align-items: center; gap: 10px; padding: 6px 4px 2px; flex-shrink: 0; }
.ds-quick-tagger { padding: 8px 16px; border: none; border-radius: var(--radius-full); background: var(--gradient-accent); color: #fff; font-size: 12px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; transition: all 0.2s; }
.ds-quick-tagger:hover { transform: scale(1.03); }
.ds-quick-info { font-size: 11px; color: var(--text-tertiary); }

/* Context menu */
.ds-ctx { position: fixed; z-index: 100; background: var(--bg-elevated); border: 1px solid var(--border-accent); border-radius: var(--radius-md); padding: 8px; min-width: 200px; box-shadow: var(--shadow-lg); }
.ds-ctx-item { padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; color: var(--text-secondary); }
.ds-ctx-item:hover { background: rgba(239,68,68,0.15); color: #ef4444; }
.ds-ctx-div { height: 1px; background: var(--border-subtle); margin: 4px 0; }
.ds-ctx-replace { display: flex; gap: 4px; padding: 4px 0; }
.ds-ctx-replace input { flex: 1; padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-primary); font-size: 11px; font-family: var(--font-sans); }
.ds-ctx-replace button { padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid rgba(var(--accent-primary-rgb), 0.3); background: var(--accent-bg); color: var(--accent-primary); font-size: 11px; cursor: pointer; font-family: var(--font-sans); }

/* Batch */
.ds-batch { display: flex; gap: 8px; padding: 10px 14px; flex-shrink: 0; }
.ds-batch-group { display: flex; gap: 4px; flex: 1; }
.ds-batch-group input { flex: 1; min-width: 0; padding: 7px 12px; border-radius: var(--radius-full); border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-primary); font-size: 11px; font-family: var(--font-sans); }
.ds-batch-group input:focus { outline: none; border-color: var(--border-accent); }
.ds-batch-group button { padding: 7px 14px; border-radius: var(--radius-full); white-space: nowrap; border: 1px solid rgba(var(--accent-primary-rgb), 0.2); background: var(--accent-bg); color: var(--accent-primary); font-size: 11px; font-weight: 600; font-family: var(--font-sans); cursor: pointer; }
.ds-batch-group button:hover { background: var(--accent-bg-hover); }
.ds-batch-group button.danger { border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.08); color: #ef4444; }
.ds-batch-group button.danger:hover { background: rgba(239,68,68,0.15); }
</style>

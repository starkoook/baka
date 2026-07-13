<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useGalleryStore } from '@/stores/gallery'
import { useTaggerV2Store } from '@/stores/taggerV2'
import { useAppStore } from '@/stores/app'
import GalleryGrid from '@/components/tagger/GalleryGrid.vue'
import TagImageModal from '@/components/tagger/TagImageModal.vue'
import TagProgressOverlay from '@/components/tagger/TagProgressOverlay.vue'
import TagSettingsPanel from '@/components/tagger/TagSettingsPanel.vue'
import SelectionActions from '@/components/tagger/SelectionActions.vue'

const galleryStore = useGalleryStore()
const taggerStore = useTaggerV2Store()
const appStore = useAppStore()

// ── View mode ──
const viewMode = ref<'small' | 'large' | 'list'>('small')

// ── View tabs ──
type Tab = 'browse' | 'workspace' | 'dataset'
const activeTab = ref<Tab>('browse')

// ── Settings config ──
const tagConfig = ref<any>({ tagSource: 'local', threshold: 0.35, localModel: null, llm: {} })

function applySettings(config: any) {
  tagConfig.value = config
  appStore.setStatus('标注设置已更新')
}

// ── Multi-select ──
const selectedCount = computed(() => galleryStore.selectedCount)
const selectedPaths = computed(() => galleryStore.images.filter(i => galleryStore.selectedIds.has(i.id)).map(i => i.path))
const selectedImages = computed(() => galleryStore.images.filter(i => galleryStore.selectedIds.has(i.id)))

// ── Modal ──
const modalVisible = ref(false)
const modalIndex = ref(0)
const modalMeta = ref<SDMetadata | null>(null)
const modalFullSrc = ref('')
const modalThumbSrc = ref('')
const modalImage = computed(() => modalIndex.value >= 0 && modalIndex.value < galleryStore.images.length ? galleryStore.images[modalIndex.value] : null)
const modalImageId = computed(() => modalImage.value?.id ?? 0)
const modalTags = computed(() => (galleryStore.imageTags.get(modalImageId.value) || []).map(t => ({ tag: t.tag, confidence: t.confidence, source: t.source })))

async function loadFullImage(image: { path: string }) {
  modalFullSrc.value = ''
  try { const r = await window.fsAPI.readImageBase64(image.path); if (r.success && r.base64) modalFullSrc.value = `data:${r.mime};base64,${r.base64}` } catch (_) {}
}

function openModal(index: number) {
  modalIndex.value = index; modalVisible.value = true; modalMeta.value = null; modalFullSrc.value = ''
  const img = galleryStore.images[index]
  if (!img) return
  loadFullImage(img)
  if (!galleryStore.imageTags.has(img.id)) galleryStore.fetchTags(img.id)
  window.galleryAPI?.getMetadata(img.id).then(r => { if (r.success) modalMeta.value = r.data })
}
function closeModal() { modalVisible.value = false }
function modalPrev() { if (modalIndex.value > 0) openModal(modalIndex.value - 1) }
function modalNext() { if (modalIndex.value < galleryStore.images.length - 1) openModal(modalIndex.value + 1) }
function handleKeydown(e: KeyboardEvent) {
  if (!modalVisible.value) return
  if (e.key === 'Escape') closeModal()
  if (e.key === 'ArrowLeft') modalPrev()
  if (e.key === 'ArrowRight') modalNext()
}
function handleSaveTags(imageId: number, tags: { tag: string; confidence?: number; source?: string }[]) {
  window.galleryAPI?.setImageTags(imageId, tags.map(t => ({ ...t, category: 'general' } as any)))
  galleryStore.imageTags.set(imageId, tags.map(t => ({ tag: t.tag, confidence: t.confidence, source: t.source, category: 'general' })))
}

// ── Gallery actions ──
async function handleAddRoot() {
  const dir = await window.fsAPI?.selectFolder()
  if (!dir) return
  appStore.setStatus('正在扫描...')
  try {
    await galleryStore.addRoot(dir)
  } catch (e: any) {
    appStore.setStatus('出错: ' + (e.message || e))
  }
}
async function handleScan() {
  if (galleryStore.roots.length === 0) {
    appStore.setStatus('杂鱼～还没添加文件夹，baka大人找不到！')
    return
  }
  if (galleryStore.activeRootId === undefined) {
    appStore.setStatus('杂鱼～请先在左侧选择一个文件夹再同步！')
    return
  }
  await galleryStore.scanRoot()
}
function handleRootClick(root: LibraryRoot) { galleryStore.setActiveRoot(root.id) }
function handleLoadThumb(imageId: number, el: HTMLImageElement) {
  window.galleryAPI?.getThumbnail(imageId).then(r => { if (r.success) el.src = `data:image/jpeg;base64,${r.data.base64}` })
}
function handleScrollEnd() { galleryStore.loadMore() }
function handleCardDblClick(image: any, index: number) {
  // Deselect others, select this one, open modal
  galleryStore.clearSelection()
  galleryStore.toggleSelect(image.id, true)
  openModal(index)
}
function handleCardCheck(image: any) {
  galleryStore.toggleSelect(image.id, true)
}

// ── Tagging ──
async function tagSelected() {
  const ids = selectedCount.value > 0 ? [...galleryStore.selectedIds] : [modalImageId.value]
  if (ids.length === 0) return appStore.setStatus('请先选择图片')
  const imgs = galleryStore.images.filter(i => ids.includes(i.id))
  if (imgs.length === 0) return
  appStore.setStatus(`正在标注 ${imgs.length} 张...`)
  await taggerStore.inferBatch(imgs.map(i => i.path))
  for (const id of ids) { galleryStore.imageTags.delete(id); galleryStore.fetchTags(id) }
  appStore.setStatus('标注完成')
}

// ── Workspace ──
const wsImages = ref<{ path: string; filename: string }[]>([])
const wsSelected = ref<Set<string>>(new Set())
const wsSelectedCount = computed(() => wsSelected.value.size)

function wsSelectAll() {
  wsSelected.value = new Set(wsImages.value.map(i => i.path))
}
function wsClearSel() {
  wsSelected.value = new Set()
}
function wsToggle(path: string) {
  const next = new Set(wsSelected.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  wsSelected.value = next
}
async function wsImportFiles() {
  if (!window.fsAPI) return
  const paths = await window.fsAPI.selectImages()
  if (!paths || paths.length === 0) return
  for (const p of paths) {
    if (!wsImages.value.find(i => i.path === p)) {
      wsImages.value.push({ path: p, filename: p.split(/[/\\]/).pop() || p })
    }
  }
  appStore.setStatus(`已添加 ${paths.length} 张到标注队列`)
}
async function wsImportFolder() {
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (!folder) return
  const files = await window.fsAPI.listImages(folder)
  if (!files || files.length === 0) { appStore.setStatus('该文件夹没有图片'); return }
  for (const f of files) {
    if (!wsImages.value.find(i => i.path === f.path)) {
      wsImages.value.push({ path: f.path, filename: f.name })
    }
  }
  appStore.setStatus(`已添加 ${files.length} 张到标注队列`)
}
function wsRemove(path: string) {
  wsImages.value = wsImages.value.filter(i => i.path !== path)
  wsToggle(path)
}
async function wsTagSelected() {
  const paths = wsSelectedCount.value > 0 ? [...wsSelected.value] : wsImages.value.map(i => i.path)
  if (paths.length === 0) return appStore.setStatus('标注队列为空，请先导入图片')
  appStore.setStatus(`正在标注 ${paths.length} 张...`)
  await taggerStore.inferBatch(paths)
  appStore.setStatus('标注完成')
}

// ── Dataset ──
const editingDatasetItem = ref<any>(null)
const editDSCaption = ref('')
const showDSDialog = ref(false)
const dsDialogName = ref('')

function handleEditDatasetItem(item: any) { editingDatasetItem.value = item; editDSCaption.value = item.caption || ''; dsTagInput.value = '' }
function handleDeleteDataset(folderPath: string) {
  if (confirm('确定要删除这个数据集吗？图片文件不会被删除。')) {
    galleryStore.deleteDataset(folderPath)
  }
}

// Tag editing helpers
const dsTagInput = ref('')
const dsTags = computed(() => editDSCaption.value.split(/[,，\n]/).map(t => t.trim()).filter(t => t))

function dsAddTag(tag: string) {
  const t = tag.trim()
  if (!t) return
  const current = dsTags.value
  if (current.includes(t)) return
  editDSCaption.value = current.length > 0 ? current.join(', ') + ', ' + t : t
  dsTagInput.value = ''
}

function dsRemoveTag(tag: string) {
  editDSCaption.value = dsTags.value.filter(t => t !== tag).join(', ')
}

function dsHandleTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    dsAddTag(dsTagInput.value)
  }
}
async function handleSaveDSCaption() {
  if (!editingDatasetItem.value) return
  await galleryStore.saveDatasetCaption(editingDatasetItem.value, editDSCaption.value)
  editingDatasetItem.value = null
}
async function handleExportDataset() {
  if (!galleryStore.activeDatasetId) return
  await galleryStore.exportDatasetCaptions(galleryStore.activeDatasetId)
  appStore.setStatus('导出完成')
}

// ── Dataset dialog (redesigned) ──
const dsPickMode = ref<'new' | 'pick'>('pick')  // 'new' = create new, 'pick' = add to existing
const dsSelectedFolder = ref('')
const dsPickFolder = ref('')  // selected existing dataset folderPath

function openAddDatasetDialog() {
  const paths = selectedImages.value.map(i => i.path)
  if (paths.length === 0) { appStore.setStatus('请先在图库里选中图片'); return }
  dsDialogName.value = ''
  dsSelectedFolder.value = ''
  dsPickMode.value = galleryStore.datasets.length > 0 ? 'pick' : 'new'
  dsPickFolder.value = galleryStore.datasets[0]?.folderPath || ''
  showDSDialog.value = true
}

function openNewDatasetDialog() {
  dsDialogName.value = ''
  dsSelectedFolder.value = ''
  dsPickMode.value = 'new'
  dsPickFolder.value = ''
  showDSDialog.value = true
}

function pickExistingDS(folderPath: string) {
  dsPickFolder.value = folderPath
}

async function dsSelectFolder() {
  if (!window.fsAPI) return
  const p = await window.fsAPI.selectFolder()
  if (p) dsSelectedFolder.value = p
}

async function importFolderToDataset() {
  if (!galleryStore.activeDatasetId) { appStore.setStatus('请先选择一个数据集'); return }
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (!folder) return
  const files = await window.fsAPI.listImages(folder)
  if (!files || files.length === 0) { appStore.setStatus('该文件夹没有图片'); return }
  const paths = files.map((f: any) => f.path)
  await galleryStore.addToDataset(galleryStore.activeDatasetId, paths)
  appStore.setStatus(`已导入 ${paths.length} 张到数据集`)
  galleryStore.loadDatasetImages(galleryStore.activeDatasetId)
}

async function importImagesToDataset() {
  if (!galleryStore.activeDatasetId) { appStore.setStatus('请先选择一个数据集'); return }
  if (!window.fsAPI) return
  const paths = await window.fsAPI.selectImages()
  if (!paths || paths.length === 0) return
  await galleryStore.addToDataset(galleryStore.activeDatasetId, paths)
  appStore.setStatus(`已导入 ${paths.length} 张到数据集`)
  galleryStore.loadDatasetImages(galleryStore.activeDatasetId)
}

async function importFolderAsDataset() {
  if (!window.fsAPI) return
  const folder = await window.fsAPI.selectFolder()
  if (!folder) return

  // Already a dataset? Just load it
  const existing = galleryStore.datasets.find(d => d.folderPath === folder)
  if (existing) {
    appStore.setStatus('该文件夹已是数据集，直接加载')
    activeTab.value = 'dataset'
    galleryStore.loadDatasetImages(folder)
    return
  }

  // Scan folder for images
  const files = await window.fsAPI.listImages(folder)
  if (!files || files.length === 0) {
    appStore.setStatus('该文件夹没有图片')
    return
  }

  const name = folder.split(/[/\\]/).pop() || folder
  const paths = files.map((f: any) => f.path)

  // Import directly — images are already in the folder, no copy needed
  galleryStore.importFolderDataset(name, folder, paths)
  appStore.setStatus(`已导入: ${name} (${paths.length}张)`)
  activeTab.value = 'dataset'
  galleryStore.loadDatasetImages(folder)
}

async function confirmDSDialog() {
  const paths = selectedImages.value.map(i => i.path)

  if (dsPickMode.value === 'new') {
    const name = dsDialogName.value.trim()
    if (!name) { appStore.setStatus('请输入数据集名称'); return }
    if (!dsSelectedFolder.value) { appStore.setStatus('请选择存放位置'); return }
    const ds = await galleryStore.createDataset(name, dsSelectedFolder.value, paths)
    if (ds) {
      appStore.setStatus(`已创建: ${name}${paths.length ? ` (${paths.length}张)` : ''}`)
      showDSDialog.value = false
      activeTab.value = 'dataset'
      galleryStore.loadDatasetImages(ds.folderPath)
    }
  } else {
    if (paths.length === 0) { appStore.setStatus('请先在图库里选中图片'); return }
    const ds = galleryStore.datasets.find(d => d.folderPath === dsPickFolder.value)
    if (!ds) { appStore.setStatus('请选择一个数据集'); return }
    await galleryStore.addToDataset(ds.folderPath, paths)
    appStore.setStatus(`已添加 ${paths.length} 张到 ${ds.name}`)
    showDSDialog.value = false
    activeTab.value = 'dataset'
    galleryStore.loadDatasetImages(ds.folderPath)
  }
}

// ── Drag & drop ──
const isDragOver = ref(false)
function onDragOver(e: DragEvent) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; isDragOver.value = true }
function onDragLeave() { isDragOver.value = false }
async function onDrop(e: DragEvent) {
  e.preventDefault(); isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]; if (!file) return
  const fp = window.galleryAPI?.getFilePath(file); if (!fp) return
  if (!['png','jpg','jpeg','webp','bmp'].includes(fp.split('.').pop()?.toLowerCase() || '')) return
  const r = await window.galleryAPI!.readFileMeta(fp)
  if (r.success && r.data) {
    const img: any = { id: -1, path: fp, filename: file.name, dirname: '', root_id: null, width: r.data.width || 0, height: r.data.height || 0, file_size: file.size, file_modified_at: '', indexed_at: '', thumb_hash: null }
    galleryStore.images.unshift(img); galleryStore.clearSelection()
    modalIndex.value = 0; modalMeta.value = r.data
    if (r.data.thumbBase64) modalThumbSrc.value = `data:image/jpeg;base64,${r.data.thumbBase64}`
    loadFullImage(img); modalVisible.value = true
  }
}

onMounted(() => {
  galleryStore.setupScanListener(); galleryStore.loadRoots()
  taggerStore.loadModels(); taggerStore.setupProgressListener()
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="tv2-root" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <!-- Drag overlay -->
    <div v-if="isDragOver" class="tv2-drag">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span>拖入图片识别元数据</span>
    </div>

    <!-- ═══ TOP BAR ═══ -->
    <div class="tv2-topbar">
      <div class="tv2-tabs">
        <button :class="{ active: activeTab === 'browse' }" @click="activeTab = 'browse'">📷 图库浏览</button>
        <button :class="{ active: activeTab === 'workspace' }" @click="activeTab = 'workspace'">🏷 标注工作台</button>
        <button :class="{ active: activeTab === 'dataset' }" @click="activeTab = 'dataset'">📦 数据集</button>
      </div>
      <div class="tv2-top-actions">
        <!-- Browse tab actions -->
        <template v-if="activeTab === 'browse'">
          <button class="tv2-top-btn add" @click="handleAddRoot">📂 添加文件夹</button>
          <button class="tv2-top-btn" @click="tagSelected" :disabled="galleryStore.images.length === 0 || taggerStore.isProcessing">🔮 标注{{ selectedCount > 0 ? ` (${selectedCount})` : '' }}</button>
          <span class="tv2-sel-info" v-if="selectedCount > 0">已选 {{ selectedCount }} 张</span>
          <div class="tv2-view-toggle">
            <button :class="{ on: viewMode === 'small' }" @click="viewMode = 'small'">⊞</button>
            <button :class="{ on: viewMode === 'large' }" @click="viewMode = 'large'">⊟</button>
            <button :class="{ on: viewMode === 'list' }" @click="viewMode = 'list'">☰</button>
          </div>
        </template>
        <!-- Workspace tab actions -->
        <template v-if="activeTab === 'workspace'">
          <button class="tv2-top-btn add" @click="wsImportFiles">🖼 选图片</button>
          <button class="tv2-top-btn add" @click="wsImportFolder">📂 选文件夹</button>
          <button class="tv2-top-btn" @click="wsTagSelected" :disabled="(wsImages.length === 0 && selectedCount === 0) || taggerStore.isProcessing">🔮 标注{{ wsSelectedCount > 0 ? ` (${wsSelectedCount})` : wsImages.length > 0 ? ` (${wsImages.length})` : '' }}</button>
          <span class="tv2-sel-info" v-if="wsSelectedCount > 0">已选 {{ wsSelectedCount }} 张</span>
        </template>
        <!-- Dataset tab actions -->
        <template v-if="activeTab === 'dataset'">
          <button class="tv2-top-btn add" @click="importFolderAsDataset">📂 导入文件夹</button>
          <button class="tv2-top-btn add" @click="openNewDatasetDialog">📦 新建数据集</button>
        </template>
      </div>
    </div>

    <!-- ═══ BODY ═══ -->
    <div class="tv2-body">
      <!-- TAB: Browse -->
      <div v-if="activeTab === 'browse'" class="tv2-browse-row">
        <aside class="tv2-sidebar">
          <div class="tv2-side-head"><span>图库目录</span></div>
          <div class="tv2-root-list">
            <button :class="{ active: galleryStore.activeRootId === null && galleryStore.images.length > 0 }" @click="galleryStore.setActiveRoot(null)">全部图片</button>
            <button v-for="r in galleryStore.roots" :key="r.id" :class="{ active: galleryStore.activeRootId === r.id }" @click="handleRootClick(r)">{{ r.label }} <span>{{ r.image_count ?? 0 }}</span></button>
          </div>
          <button class="tv2-scan" :disabled="galleryStore.isScanning" @click="handleScan">{{ galleryStore.isScanning ? '同步中...' : '🔄 同步' }}</button>
        </aside>

        <GalleryGrid
          :images="galleryStore.images as any" :selected-ids="galleryStore.selectedIds"
          :image-tags="galleryStore.imageTags as any" :is-loading="galleryStore.isLoading"
          :is-scanning="galleryStore.isScanning" :has-more="galleryStore.hasMore" :view-mode="viewMode"
          @dbl-click-card="handleCardDblClick" @check-card="handleCardCheck"
          @scroll-end="handleScrollEnd" @request-thumb="handleLoadThumb"
        />

        <!-- Right selection panel -->
        <SelectionActions v-if="selectedCount > 0" :selected-count="selectedCount" :selected-paths="selectedPaths" @done="galleryStore.clearSelection()" @add-to-dataset="openAddDatasetDialog" />

        <!-- Modals -->
        <TagImageModal
          :visible="modalVisible" :image="modalImage as any" :images="galleryStore.images as any"
          :image-index="modalIndex" :meta="(modalMeta || { hasMetadata: false }) as any"
          :tags="modalTags" :full-src="modalFullSrc" :thumb-src="modalThumbSrc"
          @close="closeModal" @prev="modalPrev" @next="modalNext"
          @save-tags="handleSaveTags"
          @tag-current="(id) => { galleryStore.clearSelection(); galleryStore.toggleSelect(id, true); tagSelected() }"
        />
        <TagProgressOverlay
          :visible="taggerStore.batchVisible" :completed="taggerStore.batchCompleted"
          :total="taggerStore.batchTotal" :current-file="taggerStore.batchCurrentFile"
          :provider="taggerStore.batchProvider" :task-id="taggerStore.taskId"
          @cancel="window.taggerV2API?.cancel(taggerStore.taskId)"
        />
      </div>

      <!-- TAB: Workspace -->
      <div v-if="activeTab === 'workspace'" class="tv2-workspace">
        <div class="tws-left">
          <div class="tws-queue-head">
            标注队列
            <span class="tws-q-count">{{ wsImages.length || selectedCount }} 张</span>
          </div>
          <div class="tws-queue">
            <div v-for="img in wsImages" :key="img.path"
              :class="{ selected: wsSelected.has(img.path) }"
              class="tws-queue-item" @click="wsToggle(img.path)"
            >
              <span class="tws-q-check">{{ wsSelected.has(img.path) ? '☑' : '☐' }}</span>
              <span>{{ img.filename }}</span>
              <button class="tws-q-remove" @click.stop="wsRemove(img.path)">×</button>
            </div>
            <div v-if="wsImages.length === 0" class="tws-empty">
              <p>队列是空的</p>
              <p class="tws-empty-sub">点顶栏「选图片」或「选文件夹」导入，或从图库浏览中选中图片</p>
            </div>
          </div>
          <div class="tws-q-actions" v-if="wsImages.length > 0">
            <button class="tws-q-btn" @click="wsSelectAll">全选</button>
            <button class="tws-q-btn" @click="wsClearSel">取消</button>
          </div>
        </div>
        <div class="tws-center">
          <div class="tws-placeholder" v-if="!modalImage">选择队列中的图片预览</div>
          <img v-else-if="modalFullSrc" :src="modalFullSrc" class="tws-preview" />
        </div>
        <div class="tws-right">
          <TagSettingsPanel :model-dir="''" @apply="applySettings" @close="showSettings = false" />
        </div>
      </div>

      <!-- TAB: Dataset -->
      <div v-if="activeTab === 'dataset'" class="tv2-dataset">
        <div class="tds-sidebar">
          <div class="tds-side-head">
            <span>数据集</span>
            <button class="tds-new-ds" @click="openNewDatasetDialog">＋</button>
          </div>
          <div class="tds-ds-list" v-if="galleryStore.datasets.length > 0">
            <div v-for="ds in galleryStore.datasets" :key="ds.folderPath"
              :class="{ active: galleryStore.activeDatasetId === ds.folderPath }"
              class="tds-ds-item"
              @click="galleryStore.loadDatasetImages(ds.folderPath); galleryStore.loadDatasetCaptions(ds.folderPath)"
            >
              <span class="tds-ds-name">{{ ds.name }}</span>
              <span class="tds-ds-count">{{ ds.imagePaths.length }}</span>
              <button class="tds-ds-del" @click.stop="handleDeleteDataset(ds.folderPath)" title="删除数据集">×</button>
            </div>
          </div>
          <div v-else class="tds-empty-hint">
            <span>暂无数据集</span>
            <button class="tds-empty-import" @click="importFolderAsDataset">📂</button>
          </div>
        </div>

        <div class="tds-main">
          <div v-if="!galleryStore.activeDatasetId" class="tds-placeholder">
            <span class="tds-ph-icon">📦</span>
            <h2>数据集</h2>
            <p v-if="galleryStore.datasets.length > 0">从左侧选择一个数据集</p>
            <p v-else>导入一个图片文件夹，或新建空数据集后从图库添加</p>
            <div class="tds-ph-actions">
              <button class="tds-ph-btn primary" @click="importFolderAsDataset">📂 导入文件夹</button>
              <button class="tds-ph-btn" @click="openNewDatasetDialog">🆕 新建数据集</button>
            </div>
          </div>
          <template v-else>
            <div class="tds-toolbar">
              <span class="tds-tb-count">{{ galleryStore.datasetImageItems.length }} 张</span>
              <span class="tds-tb-info">{{ galleryStore.datasetImageItems.filter(i => i.hasCaption).length }} 已标注</span>
              <button class="tds-tb-btn" @click="importImagesToDataset">🖼 选择图片</button>
              <button class="tds-tb-btn" @click="importFolderToDataset">📂 从文件夹导入</button>
              <button class="tds-tb-btn" @click="handleExportDataset">📤 批量导出标签</button>
            </div>
            <div v-if="galleryStore.datasetImageItems.length === 0" class="tds-empty-grid">
              <span class="tds-empty-icon">📭</span>
              <p>这个数据集还没有图片</p>
              <p class="tds-empty-sub">用工具栏「从文件夹导入」添加，或去图库浏览选中图片后点「添加到数据集」</p>
            </div>
            <div v-else class="tds-grid">
              <div v-for="item in galleryStore.datasetImageItems" :key="item.path" class="tds-card" :class="{ nocap: !item.hasCaption }" @click="handleEditDatasetItem(item)">
                <div class="tds-card-img">
                  <img v-if="item.thumb" :src="item.thumb" />
                  <span v-else class="tds-card-ph">🖼</span>
                </div>
                <div class="tds-card-name">{{ item.filename }}</div>
                <div class="tds-card-caption" v-if="item.caption">{{ item.caption.slice(0, 60) }}{{ item.caption.length > 60 ? '...' : '' }}</div>
              </div>
            </div>
          </template>
        </div>

        <!-- Dataset editor -->
        <div class="tds-editor" v-if="editingDatasetItem">
          <div class="tds-ed-head">
            <span>{{ editingDatasetItem.filename }}</span>
            <button @click="editingDatasetItem = null">✕</button>
          </div>
          <div class="tds-ed-tags">
            <span v-for="tag in dsTags" :key="tag" class="tds-ed-tag" @click="dsRemoveTag(tag)" :title="'点击删除: ' + tag">
              {{ tag }}
              <i>×</i>
            </span>
            <span v-if="dsTags.length === 0" class="tds-ed-no-tags">暂无标签，在下方输入</span>
          </div>
          <div class="tds-ed-input-row">
            <input
              v-model="dsTagInput"
              class="tds-ed-input"
              placeholder="输入标签，回车添加..."
              @keydown="dsHandleTagKeydown"
            />
            <button class="tds-ed-add" @click="dsAddTag(dsTagInput)" :disabled="!dsTagInput.trim()">＋</button>
          </div>
          <div class="tds-ed-info">{{ dsTags.length }} 个标签</div>
          <div class="tds-ed-actions">
            <button class="tds-ed-save" @click="handleSaveDSCaption">💾 保存</button>
            <button class="tds-ed-remove" @click="galleryStore.removeFromDataset(galleryStore.activeDatasetId!, editingDatasetItem.path); editingDatasetItem = null">🗑 移出数据集</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Dataset dialog (redesigned) -->
    <Teleport to="body">
      <div v-if="showDSDialog" class="ds-dlg-overlay" @click.self="showDSDialog = false">
        <div class="ds-dlg">
          <h3>添加到数据集</h3>
          <p class="ds-dlg-sub">已选 {{ selectedCount }} 张图片</p>

          <!-- Mode switcher -->
          <div class="ds-mode-tabs">
            <button :class="{ active: dsPickMode === 'pick' }" @click="dsPickMode = 'pick'" :disabled="galleryStore.datasets.length === 0">📋 添加到已有</button>
            <button :class="{ active: dsPickMode === 'new' }" @click="dsPickMode = 'new'">🆕 新建数据集</button>
          </div>

          <!-- Pick existing -->
          <div v-if="dsPickMode === 'pick'" class="ds-section">
            <div class="ds-dlg-list" v-if="galleryStore.datasets.length > 0">
              <button v-for="ds in galleryStore.datasets" :key="ds.folderPath"
                :class="{ active: dsPickFolder === ds.folderPath }"
                @click="pickExistingDS(ds.folderPath)" class="ds-dlg-item-btn"
              >
                <span class="ds-item-name">{{ ds.name }}</span>
                <span class="ds-item-count">{{ ds.imagePaths.length }} 张</span>
              </button>
            </div>
            <p v-else class="ds-none-hint">暂无数据集，请先新建</p>
          </div>

          <!-- Create new -->
          <div v-if="dsPickMode === 'new'" class="ds-section">
            <label class="ds-field-label">数据集名称</label>
            <input v-model="dsDialogName" placeholder="输入名称..." @keyup.enter="confirmDSDialog" autofocus class="ds-dlg-input" />
            <label class="ds-field-label">存放位置</label>
            <div class="ds-folder-row">
              <span class="ds-folder-path" :class="{ empty: !dsSelectedFolder }">{{ dsSelectedFolder || '未选择' }}</span>
              <button class="ds-folder-btn" @click="dsSelectFolder">📂 选择</button>
            </div>
          </div>

          <div class="ds-dlg-actions">
            <button class="ds-dlg-cancel" @click="showDSDialog = false">取消</button>
            <button class="ds-dlg-confirm" @click="confirmDSDialog">确认添加 {{ selectedCount }} 张</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tv2-root {
  max-width: 1600px; margin: 0 auto; height: calc(100vh - 100px);
  display: flex; flex-direction: column; gap: 6px; overflow: hidden;
  position: relative;
}
.tv2-drag {
  position: absolute; inset: 0; z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  background: rgba(244,114,182,0.08); border: 2px dashed rgba(244,114,182,0.3); border-radius: 12px;
  color: var(--accent-primary); font-size: 14px; font-weight: 600; pointer-events: none;
}

/* Top bar */
.tv2-topbar { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 2px 0 8px; }
.tv2-tabs { display: flex; gap: 0; }
.tv2-tabs button {
  padding: 7px 18px; border: none; background: transparent;
  color: var(--text-tertiary); font-size: 13px; cursor: pointer; border-radius: 6px;
  transition: color 0.15s;
}
.tv2-tabs button:hover { color: var(--text-secondary); }
.tv2-tabs button.active { color: var(--accent-primary); font-weight: 600; }
.tv2-top-actions { display: flex; align-items: center; gap: 8px; }
.tv2-sel-info { font-size: 11px; color: var(--accent-primary); font-weight: 500; }
.tv2-top-btn {
  padding: 7px 16px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
  background: linear-gradient(135deg, var(--accent-primary), #ff85c2); color: #fff;
  box-shadow: 0 2px 8px rgba(var(--accent-primary-rgb),0.2); transition: all 0.15s;
}
.tv2-top-btn:hover:not(:disabled) { filter: brightness(1.1); }
.tv2-top-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.tv2-top-btn.add { background: rgba(var(--accent-primary-rgb),0.1); color: var(--accent-primary); box-shadow: none; font-weight: 500; }
.tv2-top-btn.add:hover { background: rgba(var(--accent-primary-rgb),0.2); }
.tv2-top-btn.sec { background: rgba(255,255,255,0.04); color: var(--text-tertiary); box-shadow: none; }
.tv2-top-btn.sec:hover { background: rgba(255,255,255,0.08); color: var(--text-primary); }

.tv2-view-toggle { display: flex; gap: 2px; background: rgba(255,255,255,0.02); border-radius: 6px; padding: 2px; }
.tv2-view-toggle button { width: 28px; height: 26px; border: none; background: none; color: var(--text-tertiary); font-size: 14px; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
.tv2-view-toggle button.on { background: rgba(var(--accent-primary-rgb),0.12); color: var(--accent-primary); }

/* Body */
.tv2-body { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.tv2-browse-row { display: flex; gap: 8px; height: 100%; overflow: hidden; }
.tv2-browse-row .tv2-sidebar { flex-shrink: 0; }
.tv2-browse-row .gg-main { flex: 1; min-width: 0; }

/* Sidebar */
.tv2-sidebar { display: flex; flex-direction: column; gap: 4px; padding: 8px; overflow-y: auto; max-width: 160px; flex-shrink: 0; }
.tv2-side-head { display: flex; justify-content: space-between; font-size: 9px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 2px; }
.tv2-side-add { background: none; border: none; color: var(--accent-primary); font-size: 16px; cursor: pointer; }
.tv2-root-list { display: flex; flex-direction: column; gap: 2px; }
.tv2-root-list button {
  padding: 5px 8px; border: 1px solid transparent; border-radius: 6px;
  background: none; color: var(--text-tertiary); font-size: 11px; cursor: pointer; display: flex; gap: 4px; align-items: center;
  width: 100%; text-align: left; overflow: hidden;
}
.tv2-root-list button:hover { background: rgba(255,255,255,0.03); }
.tv2-root-list button.active { background: rgba(var(--accent-primary-rgb),0.08); border-color: rgba(var(--accent-primary-rgb),0.15); color: var(--accent-primary); }
.tv2-root-list button span { font-size: 9px; color: var(--text-tertiary); flex-shrink: 0; }
.tv2-scan { padding: 4px; border: none; background: none; color: var(--text-tertiary); font-size: 10px; cursor: pointer; align-self: flex-start; }
.tv2-scan:hover { color: var(--accent-primary); }

/* Workspace tab */
.tv2-workspace { display: grid; grid-template-columns: 220px 1fr 420px; gap: 8px; height: 100%; }
.tws-left { background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); border-radius: 8px; display: flex; flex-direction: column; }
.tws-queue-head { padding: 10px 12px; font-size: 10px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.03); }
.tws-queue { flex: 1; overflow-y: auto; padding: 4px; }
.tws-queue-item { padding: 6px 10px; font-size: 11px; color: var(--text-secondary); border-radius: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.tws-queue-item:hover { background: rgba(255,255,255,0.03); }
.tws-queue-item.selected { background: rgba(var(--accent-primary-rgb),0.08); color: var(--accent-primary); }
.tws-q-check { font-size: 11px; flex-shrink: 0; }
.tws-q-remove { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 12px; padding: 0 2px; margin-left: auto; flex-shrink: 0; opacity: 0; }
.tws-queue-item:hover .tws-q-remove { opacity: 0.6; }
.tws-q-remove:hover { color: var(--accent-danger); opacity: 1; }
.tws-q-count { font-size: 9px; color: var(--text-tertiary); font-weight: 400; }
.tws-q-actions { display: flex; gap: 4px; padding: 4px 0; }
.tws-q-btn { padding: 3px 10px; border: 1px solid rgba(255,255,255,0.06); background: none; color: var(--text-tertiary); font-size: 10px; border-radius: 4px; cursor: pointer; }
.tws-q-btn:hover { background: rgba(255,255,255,0.04); color: var(--text-secondary); }
.tws-empty { padding: 20px; text-align: center; font-size: 11px; color: var(--text-muted); }
.tws-empty p { margin: 2px 0; }
.tws-empty-sub { font-size: 10px; color: var(--text-muted); }
.tws-center { display: flex; align-items: center; justify-content: center; background: #111112; border-radius: 8px; overflow: hidden; }
.tws-placeholder { color: var(--text-muted); font-size: 14px; }
.tws-preview { max-width: 100%; max-height: 100%; object-fit: contain; }
.tws-right { overflow-y: auto; }

/* Dataset tab */
.tv2-dataset { display: flex; gap: 8px; height: 100%; overflow: hidden; }
.tds-sidebar { width: 170px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
.tds-side-head { display: flex; justify-content: space-between; align-items: center; font-size: 10px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px; }
.tds-new-ds { background: none; border: 1px solid rgba(var(--accent-primary-rgb),0.15); color: var(--accent-primary); font-size: 14px; cursor: pointer; border-radius: 4px; padding: 0 6px; }
.tds-ds-list { display: flex; flex-direction: column; gap: 2px; }
.tds-ds-item, .tds-ds-list button { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: none; background: none; color: var(--text-tertiary); font-size: 11px; cursor: pointer; border-radius: 6px; width: 100%; text-align: left; }
.tds-ds-item:hover, .tds-ds-list button:hover { background: rgba(255,255,255,0.03); }
.tds-ds-item.active, .tds-ds-list button.active { background: rgba(var(--accent-primary-rgb),0.08); color: var(--accent-primary); }
.tds-ds-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tds-ds-count { font-size: 9px; color: var(--text-tertiary); }
.tds-ds-del { background: none; border: none; color: var(--text-muted); font-size: 12px; cursor: pointer; padding: 0; width: 18px; height: 18px; line-height: 18px; text-align: center; opacity: 0; transition: opacity 0.15s; flex-shrink: 0; }
.tds-ds-item:hover .tds-ds-del { opacity: 0.5; }
.tds-ds-item:hover .tds-ds-del:hover { opacity: 1; color: var(--accent-danger); }
.tds-empty-hint { font-size: 11px; color: var(--text-muted); text-align: center; padding: 20px 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.tds-empty-import { background: rgba(var(--accent-primary-rgb),0.08); border: 1px solid rgba(var(--accent-primary-rgb),0.12); border-radius: 6px; color: var(--accent-primary); font-size: 13px; cursor: pointer; padding: 4px 10px; }
.tds-empty-import:hover { background: rgba(var(--accent-primary-rgb),0.15); }

.tds-main { flex: 1; overflow-y: auto; min-width: 0; }
.tds-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
.tds-ph-icon { font-size: 48px; opacity: 0.4; }
.tds-placeholder h2 { font-size: 18px; color: var(--text-tertiary); margin: 0; }
.tds-placeholder p { font-size: 12px; color: var(--text-muted); margin: 0; }
.tds-ph-actions { display: flex; gap: 8px; margin-top: 12px; }
.tds-ph-btn {
  padding: 9px 18px; border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03); border-radius: 8px;
  color: var(--text-tertiary); font-size: 12px; cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.tds-ph-btn:hover { background: rgba(255,255,255,0.06); color: var(--text-primary); }
.tds-ph-btn.primary { background: rgba(var(--accent-primary-rgb),0.1); border-color: rgba(var(--accent-primary-rgb),0.2); color: var(--accent-primary); }
.tds-ph-btn.primary:hover { background: rgba(var(--accent-primary-rgb),0.18); }
.tds-toolbar { display: flex; align-items: center; gap: 10px; padding: 8px 0; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.tds-tb-count { font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.tds-tb-info { font-size: 11px; color: var(--text-tertiary); }
.tds-tb-btn { margin-left: auto; padding: 5px 12px; border: 1px solid rgba(var(--accent-primary-rgb),0.15); background: rgba(var(--accent-primary-rgb),0.06); color: var(--accent-primary); border-radius: 6px; font-size: 11px; cursor: pointer; }
.tds-tb-btn:hover { background: rgba(var(--accent-primary-rgb),0.12); }

.tds-empty-grid { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text-muted); text-align: center; }
.tds-empty-icon { font-size: 40px; opacity: 0.3; margin-bottom: 8px; }
.tds-empty-grid p { font-size: 13px; margin: 4px 0; color: var(--text-tertiary); }
.tds-empty-sub { font-size: 11px; color: var(--text-muted); }
.tds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
.tds-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; overflow: hidden; cursor: pointer; transition: all 0.15s; }
.tds-card:hover { border-color: rgba(var(--accent-primary-rgb),0.15); }
.tds-card.nocap { opacity: 0.8; }
.tds-card.nocap:hover { opacity: 1; }
.tds-card-img { aspect-ratio: 1; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.tds-card-img img { width: 100%; height: 100%; object-fit: cover; }
.tds-card-ph { font-size: 28px; opacity: 0.2; }
.tds-card-name { padding: 5px 8px; font-size: 10px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tds-card-caption { padding: 0 8px 6px; font-size: 9px; color: var(--text-tertiary); line-height: 1.3; }

/* Dataset editor */
.tds-editor { width: 260px; flex-shrink: 0; background: rgba(24,24,26,0.8); border: 1px solid rgba(255,255,255,0.04); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.tds-ed-head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.tds-ed-head button { background: none; border: none; color: var(--text-tertiary); cursor: pointer; font-size: 16px; }
.tds-ed-head button:hover { color: var(--accent-danger); }
.tds-ed-tags { display: flex; flex-wrap: wrap; gap: 5px; min-height: 32px; padding: 6px 8px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; align-items: flex-start; align-content: flex-start; }
.tds-ed-no-tags { font-size: 11px; color: var(--text-muted); align-self: center; }
.tds-ed-tag {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 2px 7px; background: rgba(var(--accent-primary-rgb),0.12); border: 1px solid rgba(var(--accent-primary-rgb),0.2);
  border-radius: 12px; font-size: 11px; color: var(--accent-primary); cursor: pointer; user-select: none;
  transition: all 0.1s;
}
.tds-ed-tag:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); color: var(--accent-danger); }
.tds-ed-tag i { font-style: normal; font-size: 11px; opacity: 0.5; }
.tds-ed-tag:hover i { opacity: 1; }
.tds-ed-input-row { display: flex; gap: 4px; }
.tds-ed-input {
  flex: 1; padding: 7px 10px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: inherit; box-sizing: border-box;
}
.tds-ed-input:focus { outline: none; border-color: rgba(var(--accent-primary-rgb),0.3); }
.tds-ed-add {
  padding: 7px 12px; border: 1px solid rgba(var(--accent-primary-rgb),0.2); background: rgba(var(--accent-primary-rgb),0.08);
  border-radius: 6px; color: var(--accent-primary); font-size: 14px; cursor: pointer;
}
.tds-ed-add:hover:not(:disabled) { background: rgba(var(--accent-primary-rgb),0.18); }
.tds-ed-add:disabled { opacity: 0.3; cursor: default; }
.tds-ed-info { font-size: 10px; color: var(--text-tertiary); }
.tds-ed-actions { display: flex; gap: 6px; }
.tds-ed-save { flex: 1; padding: 8px; border: none; border-radius: 6px; background: linear-gradient(135deg, var(--accent-primary), #ff85c2); color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
.tds-ed-remove { padding: 8px 12px; border: 1px solid rgba(239,68,68,0.15); background: rgba(239,68,68,0.05); border-radius: 6px; color: var(--accent-danger); font-size: 11px; cursor: pointer; }

/* Dataset dialog */
.ds-dlg-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 200; }
.ds-dlg { background: #1c1c1e; border: 1px solid rgba(var(--accent-primary-rgb),0.1); border-radius: 14px; padding: 24px; width: 360px; }
.ds-dlg h3 { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0 0 16px; }
.ds-dlg-input { width: 100%; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: var(--text-primary); font-size: 13px; box-sizing: border-box; margin-bottom: 12px; }
.ds-dlg-list { max-height: 160px; overflow-y: auto; margin-bottom: 14px; display: flex; flex-direction: column; gap: 2px; }
.ds-dlg-item-btn { width: 100%; padding: 8px 10px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--text-tertiary); display: flex; justify-content: space-between; background: none; font-family: inherit; text-align: left; }
.ds-dlg-item-btn:hover { background: rgba(255,255,255,0.05); }
.ds-dlg-item-btn.active { background: rgba(var(--accent-primary-rgb),0.08); color: var(--accent-primary); }
.ds-dlg-item-btn span { font-size: 10px; color: var(--text-tertiary); }
.ds-dlg-item-btn.active span { color: var(--accent-primary); }
.ds-dlg-actions { display: flex; gap: 8px; }
.ds-dlg-confirm { flex: 1; padding: 10px; border: none; border-radius: 8px; background: linear-gradient(135deg, var(--accent-primary), #ff85c2); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
.ds-dlg-cancel { padding: 10px 16px; background: none; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; color: var(--text-tertiary); font-size: 13px; cursor: pointer; }
.ds-dlg-sub { font-size: 12px; color: var(--accent-primary); margin: -12px 0 16px; font-weight: 500; }

.ds-mode-tabs { display: flex; gap: 4px; margin-bottom: 14px; }
.ds-mode-tabs button {
  flex: 1; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02); border-radius: 8px;
  color: var(--text-tertiary); font-size: 12px; cursor: pointer; transition: all 0.15s;
}
.ds-mode-tabs button:hover:not(:disabled) { background: rgba(255,255,255,0.04); color: var(--text-primary); }
.ds-mode-tabs button.active { background: rgba(var(--accent-primary-rgb),0.1); border-color: rgba(var(--accent-primary-rgb),0.25); color: var(--accent-primary); font-weight: 600; }
.ds-mode-tabs button:disabled { opacity: 0.3; cursor: not-allowed; }

.ds-section { margin-bottom: 14px; }
.ds-field-label { display: block; font-size: 10px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.04em; }
.ds-folder-row { display: flex; gap: 6px; align-items: center; }
.ds-folder-path { flex: 1; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-folder-path.empty { color: var(--text-muted); }
.ds-folder-btn { padding: 8px 12px; border: 1px solid rgba(var(--accent-primary-rgb),0.15); background: rgba(var(--accent-primary-rgb),0.06); border-radius: 6px; color: var(--accent-primary); font-size: 11px; cursor: pointer; white-space: nowrap; }
.ds-folder-btn:hover { background: rgba(var(--accent-primary-rgb),0.12); }
.ds-none-hint { font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px 0; }
.ds-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-item-count { flex-shrink: 0; }
</style>

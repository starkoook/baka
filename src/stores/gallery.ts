import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAppStore } from './app'
import { useLogStore } from './logs'
import {
  applyGallerySelection,
  type GalleryReturnContext,
} from '@/features/gallery/gallery-workflow'

export const useGalleryStore = defineStore('gallery', () => {
  const roots = ref<LibraryRoot[]>([])
  const images = ref<GalleryImage[]>([])
  const selectedImage = ref<GalleryImage | null>(null)
  const selectedIds = ref<Set<number>>(new Set())
  const scanProgress = ref<ScanProgress | null>(null)
  const isScanning = ref(false)
  const isLoading = ref(false)
  const activeRootId = ref<number | null | undefined>(undefined)
  const searchQuery = ref('')
  const tagStateFilter = ref<'all' | 'tagged' | 'untagged'>('all')
  const sortMode = ref('modified-desc')
  const selectionAnchorId = ref<number | null>(null)
  const pendingReturnContext = ref<GalleryReturnContext | null>(null)
  const pendingScrollTop = ref(0)

  const currentOffset = ref(0)
  const _reachedEnd = ref(false)
  const pageSize = 100

  // Tag cache: imageId → TagInfo[]
  const imageTags = ref<Map<number, TagInfo[]>>(new Map())

  const hasMore = computed(() => !_reachedEnd.value && !isLoading.value)
  const selectedCount = computed(() => selectedIds.value.size)
  const selectedImages = computed(() => images.value.filter((img) => selectedIds.value.has(img.id)))

  async function loadRoots() {
    if (!window.galleryAPI) return
    const res = await window.galleryAPI.getRoots()
    if (res.success && res.data) roots.value = res.data
  }

  async function addRoot(folderPath: string) {
    if (!window.galleryAPI) return
    const appStore = useAppStore()
    const logStore = useLogStore()
    const res = await window.galleryAPI.addRoot(folderPath)
    if (res.success) {
      logStore.success('已添加图库根目录')
      appStore.setStatus('已添加图库')
      await loadRoots()
      await scanRoot(folderPath)
    } else {
      logStore.error(res.error || '添加失败')
    }
  }

  async function removeRoot(rootId: number, deleteImages: boolean = false) {
    if (!window.galleryAPI) return
    const logStore = useLogStore()
    const res = await window.galleryAPI.removeRoot(rootId, deleteImages)
    if (res.success) {
      logStore.info('已移除图库根目录')
      if (activeRootId.value === rootId) {
        activeRootId.value = null
        images.value = []
        _reachedEnd.value = false
      }
      await loadRoots()
    } else {
      logStore.error(res.error || '移除失败')
    }
  }

  async function scanRoot(folderPath?: string) {
    if (!window.galleryAPI) return
    const appStore = useAppStore()
    const logStore = useLogStore()
    isScanning.value = true
    scanProgress.value = { current: 0, total: 0, status: '准备扫描...' }
    appStore.setStatus('正在扫描图库...')

    const res = await window.galleryAPI.scan(folderPath)
    isScanning.value = false
    scanProgress.value = null

    if (res.success && res.data) {
      const { newCount, skipCount, errorCount } = res.data
      const removed = (res.data as any).removedCount || 0
      const parts = [`${newCount} 新增`, `${skipCount} 不变`]
      if (removed > 0) parts.push(`${removed} 移除`)
      if (errorCount > 0) parts.push(`${errorCount} 失败`)
      logStore.success(`同步完成: ${parts.join(', ')}`)
      appStore.setStatus('图库同步完成')
      await loadImages(true)
      await loadRoots() // refresh sidebar counts
    } else {
      logStore.error(res.error || '扫描失败')
      appStore.setStatus('扫描出错')
    }
  }

  async function loadImages(reset: boolean = false) {
    if (!window.galleryAPI) return
    if (reset) { currentOffset.value = 0; _reachedEnd.value = false }
    isLoading.value = true

    const res = await window.galleryAPI.getImages({
      rootId: activeRootId.value || undefined,
      limit: pageSize,
      offset: reset ? 0 : currentOffset.value,
    })

    if (res.success && res.data) {
      if (reset) {
        images.value = res.data
      } else {
        const existing = new Set(images.value.map((image) => image.id))
        images.value.push(...res.data.filter((image) => !existing.has(image.id)))
      }
      currentOffset.value = currentOffset.value + res.data.length
      if (res.data.length < pageSize) _reachedEnd.value = true
    }
    isLoading.value = false
  }

  async function loadMore() {
    if (!hasMore.value || isLoading.value) return
    await loadImages(false)
  }

  function selectImage(image: GalleryImage) {
    selectedImage.value = image
  }

  // ── Multi-select ──
  function toggleSelect(id: number, multi: boolean = false) {
    const result = applyGallerySelection(
      selectedIds.value,
      images.value.map((image) => image.id),
      id,
      multi ? 'toggle' : 'single',
      selectionAnchorId.value,
    )
    selectedIds.value = result.selectedIds
    selectionAnchorId.value = result.anchorId
  }

  function selectRange(id: number) {
    const result = applyGallerySelection(
      selectedIds.value,
      images.value.map((image) => image.id),
      id,
      'range',
      selectionAnchorId.value,
    )
    selectedIds.value = result.selectedIds
    selectionAnchorId.value = result.anchorId
  }

  function isSelected(id: number): boolean {
    return selectedIds.value.has(id)
  }

  function clearSelection() {
    selectedIds.value = new Set()
    selectionAnchorId.value = null
  }

  function selectAll() {
    selectedIds.value = new Set(images.value.map((img) => img.id))
    selectionAnchorId.value = images.value[0]?.id ?? null
  }

  function captureReturnContext(scrollTop: number): GalleryReturnContext {
    const source = activeDatasetId.value
      ? { kind: 'dataset' as const, id: activeDatasetId.value }
      : activeRootId.value != null
        ? { kind: 'root' as const, id: activeRootId.value }
        : { kind: 'all' as const, id: null }

    return {
      ...source,
      search: searchQuery.value,
      tagState: tagStateFilter.value,
      sort: sortMode.value,
      scrollTop,
      selectedIds: [...selectedIds.value],
    }
  }

  function restoreReturnContext(context: GalleryReturnContext) {
    pendingReturnContext.value = context
    searchQuery.value = context.search
    tagStateFilter.value = context.tagState
    sortMode.value = context.sort
    selectedIds.value = new Set(context.selectedIds)
    selectionAnchorId.value = context.selectedIds[0] ?? null
    pendingScrollTop.value = context.scrollTop
    activeRootId.value = null
    activeDatasetId.value = null
    datasetImageItems.value = []
    if (context.kind === 'root') activeRootId.value = Number(context.id)
    if (context.kind === 'dataset') activeDatasetId.value = String(context.id)
  }

  function replaceImagePaths(mappings: { oldPath: string; newPath: string }[]) {
    const byOldPath = new Map(mappings.map((mapping) => [mapping.oldPath, mapping.newPath]))
    images.value.forEach((image) => {
      image.path = byOldPath.get(image.path) ?? image.path
    })
    datasets.value.forEach((dataset) => {
      dataset.imagePaths = dataset.imagePaths.map((imagePath) => byOldPath.get(imagePath) ?? imagePath)
    })
    datasetImageItems.value.forEach((item) => {
      const nextPath = byOldPath.get(item.path)
      if (!nextPath) return
      item.path = nextPath
      item.filename = nextPath.split(/[/\\]/).pop() || item.filename
      item.txtPath = nextPath.replace(/\.[^.]+$/, '') + '.txt'
    })
    saveDatasets()
  }

  // ── Tag management ──
  async function fetchTags(imageId: number) {
    if (!window.galleryAPI) return
    const res = await window.galleryAPI.getImageTags(imageId)
    if (res.success && res.data) {
      imageTags.value.set(imageId, res.data)
    }
  }

  async function fetchBatchTags(imageIds: number[]) {
    if (!window.galleryAPI || imageIds.length === 0) return
    const res = await window.galleryAPI.batchGetTags(imageIds)
    if (res.success && res.data) {
      for (const [id, tags] of Object.entries(res.data)) {
        imageTags.value.set(Number(id), tags as TagInfo[])
      }
    }
  }

  async function saveTags(imageId: number, tags: { tag: string; confidence?: number; source?: string; weight?: number }[]) {
    if (!window.galleryAPI) return
    const res = await window.galleryAPI.setImageTags(imageId, tags)
    if (res.success) {
      await fetchTags(imageId)
    }
  }

  // ── Send to Tagger ──
  // V1 标注界面已移除; 选中图片的跳转改由 Gallery.vue 通过 router.push('/gallery') 处理
  function sendToTagger() {}

  function setActiveRoot(rootId: number | null) {
    activeRootId.value = rootId
    loadImages(true)
  }

  // ── Dataset ──
  interface DatasetEntry { name: string; folderPath: string; addedAt: string; imagePaths: string[] }
  interface DatasetImageItem { path: string; filename: string; caption: string; hasCaption: boolean; txtPath?: string; thumb?: string }

  const datasets = ref<DatasetEntry[]>([])
  const activeDatasetId = ref<string | null>(null)
  const datasetImageItems = ref<DatasetImageItem[]>([])
  const DATASET_LIST_KEY = 'baka-datasets'  // unified key with standalone Dataset.vue

  function loadDatasets() {
    try {
      // Read from both old and new keys, merge
      const seen = new Set<string>()
      const merged: DatasetEntry[] = []

      function ingest(raw: string) {
        let parsed: any[]
        try { parsed = JSON.parse(raw) } catch { return }
        if (!Array.isArray(parsed)) return
        for (const e of parsed) {
          const fp = e.folderPath || ''
          if (!fp || seen.has(fp)) continue
          seen.add(fp)
          merged.push({
            name: e.name || '',
            folderPath: fp,
            addedAt: e.addedAt || new Date().toISOString(),
            imagePaths: Array.isArray(e.imagePaths) ? e.imagePaths : [],
          })
        }
      }

      // New key first, then old key (new overwrites old on duplicate folderPath)
      const r = localStorage.getItem(DATASET_LIST_KEY)
      if (r) ingest(r)

      // Migrate from old key
      const old = localStorage.getItem('baka-datasets-v2')
      if (old) {
        ingest(old)
        // Once migrated, remove old key
        localStorage.removeItem('baka-datasets-v2')
      }

      datasets.value = merged
      if (merged.length > 0) saveDatasets()  // persist merged result to new key
    } catch { datasets.value = [] }
  }
  function saveDatasets() { localStorage.setItem(DATASET_LIST_KEY, JSON.stringify(datasets.value)) }

  async function createDataset(name: string, parentPath: string, imagePaths: string[] = []) {
    const folderPath = parentPath + '\\' + name
    if (window.fsAPI) {
      const r = await window.fsAPI.createFolder(folderPath)
      if (!r.success) { useLogStore().error(r.error || '创建失败'); return null }

      // Copy selected images into the new dataset folder
      if (imagePaths.length > 0) {
        const moveRes = await window.fsAPI.moveImages({
          filePaths: imagePaths,
          destFolder: folderPath,
          keepOriginal: true,
        })
        if (moveRes.success && moveRes.data?.destPaths) {
          // Use actual destination paths (handles dedup renaming)
          imagePaths = moveRes.data.destPaths
        } else {
          useLogStore().warn('图片拷贝失败: ' + (moveRes.error || '未知'))
        }
      }
    }
    const entry: DatasetEntry = { name, folderPath, addedAt: new Date().toISOString(), imagePaths }
    datasets.value.unshift(entry); saveDatasets()
    return entry
  }

  async function addToDataset(datasetId: string, imagePaths: string[]) {
    const ds = datasets.value.find(d => d.folderPath === datasetId)
    if (!ds) return
    const existing = new Set(ds.imagePaths)
    const newPaths: string[] = []

    // Copy images into the dataset folder
    if (window.fsAPI && imagePaths.length > 0) {
      const moveRes = await window.fsAPI.moveImages({
        filePaths: imagePaths,
        destFolder: datasetId,
        keepOriginal: true,
      })
      if (moveRes.success && moveRes.data?.destPaths) {
        for (const destPath of moveRes.data.destPaths) {
          if (!existing.has(destPath)) {
            ds.imagePaths.push(destPath)
            newPaths.push(destPath)
          }
        }
      } else {
        // Fallback: store original paths if copy fails
        for (const p of imagePaths) {
          if (!existing.has(p)) { ds.imagePaths.push(p); newPaths.push(p) }
        }
      }
    } else {
      for (const p of imagePaths) {
        if (!existing.has(p)) { ds.imagePaths.push(p); newPaths.push(p) }
      }
    }

    if (newPaths.length > 0) saveDatasets()
    useLogStore().success(`已添加 ${newPaths.length} 张到 ${ds.name}`)
  }

  function removeFromDataset(datasetId: string, imagePath: string) {
    const ds = datasets.value.find(d => d.folderPath === datasetId)
    if (!ds) return
    ds.imagePaths = ds.imagePaths.filter(p => p !== imagePath)
    if (activeDatasetId.value === datasetId) {
      datasetImageItems.value = datasetImageItems.value.filter(i => i.path !== imagePath)
    }
    saveDatasets()
  }

  function importFolderDataset(name: string, folderPath: string, imagePaths: string[]) {
    // Direct import — images already in the folder, no copying needed
    if (datasets.value.find(d => d.folderPath === folderPath)) {
      useLogStore().warn('该文件夹已是数据集')
      return null
    }
    const entry: DatasetEntry = { name, folderPath, addedAt: new Date().toISOString(), imagePaths }
    datasets.value.unshift(entry); saveDatasets()
    useLogStore().success(`已导入: ${name} (${imagePaths.length}张)`)
    return entry
  }

  function deleteDataset(datasetId: string) {
    datasets.value = datasets.value.filter(d => d.folderPath !== datasetId)
    if (activeDatasetId.value === datasetId) { activeDatasetId.value = null; datasetImageItems.value = [] }
    saveDatasets()
  }

  function loadDatasetImages(datasetId: string) {
    const ds = datasets.value.find(d => d.folderPath === datasetId)
    if (!ds || !Array.isArray(ds.imagePaths)) {
      datasetImageItems.value = []
      activeDatasetId.value = datasetId
      return
    }

    // Build items synchronously — no async gaps, no flicker
    const paths: string[] = ds.imagePaths.filter((p: any) => typeof p === 'string')
    const items: DatasetImageItem[] = paths.map((p: string) => {
      const filename = p.split(/[/\\]/).pop() || p
      const base = filename.replace(/\.[^.]+$/, '')
      const sep = p.includes('\\') ? '\\' : '/'
      const txtPath = p.substring(0, p.lastIndexOf(sep) + 1) + base + '.txt'
      return { path: p, filename, caption: '', hasCaption: false, txtPath }
    })

    datasetImageItems.value = items
    activeDatasetId.value = datasetId

    loadCaptionsForItems(items)
    loadThumbsBatch(0)
  }

  async function loadCaptionsForItems(items: DatasetImageItem[]) {
    if (!window.fsAPI) return
    for (const item of items) {
      if (item.hasCaption) continue
      try {
        const r = await window.fsAPI.readText(item.txtPath!)
        if (r.success && r.text && r.text.trim()) {
          item.caption = r.text
          item.hasCaption = true
        }
      } catch (_) { /* skip — .txt missing or unreadable */ }
    }
  }

  let _thumbBatchTimer: ReturnType<typeof setTimeout> | null = null

  async function loadThumbsBatch(start: number) {
    if (_thumbBatchTimer) clearTimeout(_thumbBatchTimer)
    const source = datasetImageItems.value
    const batch = source.slice(start, start + 6)
    for (const item of batch) {
      if (item.thumb) continue
      try {
        const res = await window.fsAPI.readThumb(item.path)
        if (res.success && res.base64) {
          item.thumb = 'data:image/jpeg;base64,' + res.base64
        }
      } catch (_) { /* skip */ }
    }
    if (start + 6 < source.length) {
      _thumbBatchTimer = setTimeout(() => loadThumbsBatch(start + 6), 80)
    }
  }

  async function loadDatasetCaptions(datasetId: string) {
    // Refresh captions for currently loaded items
    if (datasetImageItems.value.length === 0) return
    await loadCaptionsForItems(datasetImageItems.value)
  }
  async function saveDatasetCaption(item: DatasetImageItem, caption: string) {
    if (!item.txtPath) {
      const base = item.filename.replace(/\.[^.]+$/, '')
      item.txtPath = item.path.replace(/[/\\][^/\\]+$/, '\\' + base + '.txt')
    }
    if (window.fsAPI) {
      const r = await window.fsAPI.saveCaption({ txtPath: item.txtPath, caption })
      if (r.success) { item.caption = caption; item.hasCaption = !!caption.trim() }
    }
  }

  async function exportDatasetCaptions(datasetId: string) {
    const ds = datasets.value.find(d => d.folderPath === datasetId)
    if (!ds || !window.fsAPI) return
    let count = 0
    for (const item of datasetImageItems.value) {
      if (!item.caption) continue
      if (!item.txtPath) {
        const base = item.filename.replace(/\.[^.]+$/, '')
        item.txtPath = item.path.replace(/[/\\][^/\\]+$/, '\\' + base + '.txt')
      }
      await window.fsAPI.saveCaption({ txtPath: item.txtPath, caption: item.caption })
      item.hasCaption = true; count++
    }
    useLogStore().success(`已导出 ${count} 个标注文件`)
  }

  // Initialize
  loadDatasets()

  function setupScanListener() {
    if (!window.galleryAPI) return
    window.galleryAPI.onScanProgress((progress: ScanProgress) => {
      scanProgress.value = progress
    })
  }

  return {
    roots, images, selectedImage, selectedIds, scanProgress, isScanning, isLoading,
    activeRootId, searchQuery, tagStateFilter, sortMode, selectionAnchorId,
    pendingReturnContext, pendingScrollTop, imageTags, hasMore, selectedCount, selectedImages,
    loadRoots, addRoot, removeRoot, scanRoot, loadImages, loadMore,
    selectImage, toggleSelect, selectRange, isSelected, clearSelection, selectAll,
    captureReturnContext, restoreReturnContext, replaceImagePaths,
    fetchTags, fetchBatchTags, saveTags, sendToTagger,
    setActiveRoot, setupScanListener,
    datasets, activeDatasetId, datasetImageItems,
    loadDatasets, createDataset, addToDataset, importFolderDataset, removeFromDataset, deleteDataset,
    loadDatasetImages, loadDatasetCaptions, saveDatasetCaption, exportDatasetCaptions,
  }
})

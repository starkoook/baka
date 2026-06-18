import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAppStore } from './app'
import { useLogStore } from './logs'
import { useTaggerStore } from './tagger'

export const useGalleryStore = defineStore('gallery', () => {
  const roots = ref<LibraryRoot[]>([])
  const images = ref<GalleryImage[]>([])
  const selectedImage = ref<GalleryImage | null>(null)
  const selectedIds = ref<Set<number>>(new Set())
  const scanProgress = ref<ScanProgress | null>(null)
  const isScanning = ref(false)
  const isLoading = ref(false)
  const activeRootId = ref<number | null | undefined>(undefined)

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
        images.value.push(...res.data)
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
    if (!multi) {
      // Single click: clear all, select just this
      selectedIds.value = new Set([id])
    } else {
      // Ctrl+click: toggle
      const next = new Set(selectedIds.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selectedIds.value = next
    }
  }

  function isSelected(id: number): boolean {
    return selectedIds.value.has(id)
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  function selectAll() {
    selectedIds.value = new Set(images.value.map((img) => img.id))
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

  async function saveTags(imageId: number, tags: { tag: string; confidence?: number; source?: string }[]) {
    if (!window.galleryAPI) return
    const res = await window.galleryAPI.setImageTags(imageId, tags)
    if (res.success) {
      await fetchTags(imageId)
    }
  }

  // ── Send to Tagger ──
  function sendToTagger() {
    const ids = selectedIds.value.size > 0 ? [...selectedIds.value] : (selectedImage.value ? [selectedImage.value.id] : [])
    if (ids.length === 0) return
    const imgs = images.value.filter((img) => ids.includes(img.id))
    if (imgs.length === 0) return
    const taggerStore = useTaggerStore()
    taggerStore.importFromGallery(imgs)
  }

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
  const DATASET_LIST_KEY = 'baka-datasets-v2'

  function loadDatasets() {
    try { const r = localStorage.getItem(DATASET_LIST_KEY); if (r) datasets.value = JSON.parse(r) } catch { datasets.value = [] }
  }
  function saveDatasets() { localStorage.setItem(DATASET_LIST_KEY, JSON.stringify(datasets.value)) }

  async function createDataset(name: string, parentPath: string, imagePaths: string[] = []) {
    const folderPath = parentPath + '\\' + name
    if (window.fsAPI) {
      const r = await window.fsAPI.createFolder(folderPath)
      if (!r.success) { useLogStore().error(r.error || '创建失败'); return null }
    }
    const entry: DatasetEntry = { name, folderPath, addedAt: new Date().toISOString(), imagePaths }
    datasets.value.unshift(entry); saveDatasets()
    return entry
  }

  function addToDataset(datasetId: string, imagePaths: string[]) {
    const ds = datasets.value.find(d => d.folderPath === datasetId)
    if (!ds) return
    const existing = new Set(ds.imagePaths)
    let added = 0
    for (const p of imagePaths) { if (!existing.has(p)) { ds.imagePaths.push(p); added++ } }
    if (added > 0) saveDatasets()
    useLogStore().success(`已添加 ${added} 张到 ${ds.name}`)
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

  function deleteDataset(datasetId: string) {
    datasets.value = datasets.value.filter(d => d.folderPath !== datasetId)
    if (activeDatasetId.value === datasetId) { activeDatasetId.value = null; datasetImageItems.value = [] }
    saveDatasets()
  }

  async function loadDatasetImages(datasetId: string) {
    const ds = datasets.value.find(d => d.folderPath === datasetId)
    if (!ds) { datasetImageItems.value = []; return }
    activeDatasetId.value = datasetId
    // Map each image path to a display item
    const items: DatasetImageItem[] = []
    for (const p of ds.imagePaths) {
      const filename = p.split(/[/\\]/).pop() || p
      const base = filename.replace(/\.[^.]+$/, '')
      const txtPath = p.replace(/[/\\][^/\\]+$/, '\\' + base + '.txt').replace(/[/\\]/g, '\\')
      let caption = ''; let hasCaption = false
      try {
        if (window.fsAPI) {
          // Try to load existing caption from .txt
          const datasetData = await window.fsAPI.listDataset(ds.folderPath)
          const found = datasetData.find((f: any) => f.path === p)
          if (found) { caption = found.caption || ''; hasCaption = found.hasCaption }
        }
      } catch (_) {}
      items.push({ path: p, filename, caption, hasCaption, txtPath })
    }
    datasetImageItems.value = items
  }

  async function loadDatasetCaptions(datasetId: string) {
    const ds = datasets.value.find(d => d.folderPath === datasetId)
    if (!ds || !window.fsAPI) return
    const list = await window.fsAPI.listDataset(ds.folderPath)
    const map = new Map(list.map((f: any) => [f.path, f]))
    for (const item of datasetImageItems.value) {
      const found = map.get(item.path)
      if (found) { item.caption = found.caption || ''; item.hasCaption = found.hasCaption; item.txtPath = found.txtPath }
    }
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
    activeRootId, imageTags, hasMore, selectedCount, selectedImages,
    loadRoots, addRoot, removeRoot, scanRoot, loadImages, loadMore,
    selectImage, toggleSelect, isSelected, clearSelection, selectAll,
    fetchTags, fetchBatchTags, saveTags, sendToTagger,
    setActiveRoot, setupScanListener,
    datasets, activeDatasetId, datasetImageItems,
    loadDatasets, createDataset, addToDataset, removeFromDataset, deleteDataset,
    loadDatasetImages, loadDatasetCaptions, saveDatasetCaption, exportDatasetCaptions,
  }
})

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GallerySidebar from '@/components/tagger/GallerySidebar.vue'
import GalleryToolbar from '@/components/tagger/GalleryToolbar.vue'
import GalleryGrid from '@/components/tagger/GalleryGrid.vue'
import GalleryInspector from '@/components/tagger/GalleryInspector.vue'
import GallerySelectionBar from '@/components/tagger/GallerySelectionBar.vue'
import BatchTagDialog from '@/components/tagger/BatchTagDialog.vue'
import BatchTagToolsDialog from '@/components/tagger/BatchTagToolsDialog.vue'
import RecycleBinDialog from '@/components/tagger/RecycleBinDialog.vue'
import MetadataViewer from '@/components/tagger/MetadataViewer.vue'
import CharacterTagAuditDialog from '@/components/tagger/CharacterTagAuditDialog.vue'
import OrganizeByTagDialog from '@/components/tagger/OrganizeByTagDialog.vue'
import { createGalleryHandoff } from '@/features/gallery/gallery-workflow'
import { parseSearchQuery, matchesQuery } from '@/features/gallery/tag-filter'
import { toMediaUrl } from '@/lib/media-url'
import { useAppStore } from '@/stores/app'
import { useGalleryStore } from '@/stores/gallery'
import { useTaggerStore } from '@/stores/tagger'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const galleryStore = useGalleryStore()
const taggerStore = useTaggerStore()
const gridRef = ref<InstanceType<typeof GalleryGrid> | null>(null)
const datasetGridRef = ref<HTMLElement | null>(null)
const viewMode = ref<'small' | 'large' | 'list'>('small')
const metadataIndex = ref<number | null>(null)
const viewerMetadata = ref<SDMetadata>({ hasMetadata: false })
const viewerTags = ref<TagInfo[]>([])
const viewerImageSrc = ref('')
const viewerLoading = ref(false)
const droppedViewerImage = ref<GalleryImage | null>(null)
const isDragOver = ref(false)
let dragDepth = 0

const showDatasetDialog = ref(false)
const datasetDialogMode = ref<'pick' | 'create'>('pick')
const datasetName = ref('')
const datasetParent = ref('')
const selectedDataset = ref('')
const editingDatasetItem = ref<any>(null)
const datasetCaption = ref('')
const showFileDialog = ref(false)
const showBatchTagDialog = ref(false)
const showBatchToolsDialog = ref(false)
const showRecycleDialog = ref(false)
const showCharacterAuditDialog = ref(false)
const showOrganizeDialog = ref(false)
const fileOperation = ref<'copy' | 'move'>('copy')
const fileDestination = ref('')
const fileOperationError = ref('')
const fileOperationBusy = ref(false)
const datasetSendError = ref('')

const visibleImages = computed(() => {
  const clauses = parseSearchQuery(galleryStore.searchQuery)
  const filtered = galleryStore.images.filter((image) => {
    if (!image) return false
    const tags = galleryStore.imageTags.get(image.id) ?? []
    const searchText = `${image.filename} ${tags.map((tag) => tag.tag).join(' ')}`
    if (!matchesQuery(searchText, clauses)) return false
    if (galleryStore.tagStateFilter === 'tagged' && tags.length === 0) return false
    if (galleryStore.tagStateFilter === 'untagged' && tags.length > 0) return false
    return true
  })
  return [...filtered].sort((a, b) => {
    if (galleryStore.sortMode === 'name-asc') return a.filename.localeCompare(b.filename)
    if (galleryStore.sortMode === 'name-desc') return b.filename.localeCompare(a.filename)
    return String(b.file_modified_at).localeCompare(String(a.file_modified_at))
  })
})

const viewerImages = computed(() => droppedViewerImage.value ? [droppedViewerImage.value] : visibleImages.value)
const isTemporaryViewer = computed(() => droppedViewerImage.value !== null)

const selectedImage = computed(() => galleryStore.selectedCount === 1 ? galleryStore.selectedImages[0] ?? null : null)
const selectedTags = computed(() => selectedImage.value ? galleryStore.imageTags.get(selectedImage.value.id) ?? [] : [])
/** 详情栏的拍立得预览与生成信息：选中变化时按需取，走缓存 */
const selectedPreview = ref('')
const selectedMetadata = ref<SDMetadata | null>(null)
watch(selectedImage, async (image) => {
  selectedPreview.value = ''
  selectedMetadata.value = null
  if (!image || !window.galleryAPI) return
  const id = image.id
  const [thumb, meta] = await Promise.all([
    window.galleryAPI.getThumbnailUrl?.(id).catch(() => null),
    window.galleryAPI.getMetadata(id).catch(() => null),
  ])
  if (selectedImage.value?.id !== id) return
  if (thumb?.success && thumb.data?.url) selectedPreview.value = thumb.data.url
  if (meta?.success && meta.data) selectedMetadata.value = meta.data
})
const orderedSelectedImages = computed(() => visibleImages.value.filter((image) => galleryStore.selectedIds.has(image.id)))
const activeRoot = computed(() => galleryStore.roots.find((root) => root.id === galleryStore.activeRootId) ?? null)
const activeDataset = computed(() => galleryStore.datasets.find((dataset) => dataset.folderPath === galleryStore.activeDatasetId) ?? null)

async function refreshVisibleTags() {
  await galleryStore.fetchBatchTags(galleryStore.images.map((image) => image.id))
}

function onDragEnter() {
  dragDepth++
  isDragOver.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  isDragOver.value = dragDepth > 0
}

function resetDragState() {
  dragDepth = 0
  isDragOver.value = false
}

async function openDroppedImage(filePath: string) {
  viewerLoading.value = true
  viewerMetadata.value = { hasMetadata: false }
  viewerTags.value = []
  viewerImageSrc.value = ''
  const metadataResponse = await window.galleryAPI.readFileMeta(filePath)
  if (!metadataResponse.success || !metadataResponse.data) {
    viewerLoading.value = false
    appStore.setError(metadataResponse.error || '无法读取这张图片的元数据')
    return
  }

  const filename = filePath.split(/[/\\]/).pop() || filePath
  droppedViewerImage.value = {
    id: -1,
    path: filePath,
    filename,
    dirname: filePath.slice(0, Math.max(0, filePath.length - filename.length - 1)),
    root_id: null,
    width: metadataResponse.data.width || 0,
    height: metadataResponse.data.height || 0,
    file_size: 0,
    file_modified_at: '',
    indexed_at: '',
    thumb_hash: null,
  }
  viewerMetadata.value = metadataResponse.data
  viewerImageSrc.value = toMediaUrl(filePath)
  metadataIndex.value = 0
  viewerLoading.value = false
  appStore.setStatus('元数据读取完成')
}

async function onDrop(event: DragEvent) {
  resetDragState()
  const paths = Array.from(event.dataTransfer?.files ?? [])
    .map((file) => window.galleryAPI.getFilePath(file))
    .filter((filePath): filePath is string => Boolean(filePath))
  if (paths.length === 0) {
    appStore.setError('无法读取拖入内容')
    return
  }

  appStore.setStatus('正在读取拖入内容…')
  const inspected = await window.galleryAPI.inspectDroppedPaths(paths)
  if (!inspected.success || !inspected.data) {
    appStore.setError(inspected.error || '无法读取拖入内容')
    return
  }
  const classified = inspected.data
  if (classified.imagePaths.length === 1 && classified.folderPaths.length === 0) {
    await openDroppedImage(classified.imagePaths[0])
    return
  }

  let importedCount = 0
  let skipCount = 0
  let errorCount = classified.unsupportedCount
  if (classified.imagePaths.length) {
    const imported = await window.galleryAPI.importFiles(classified.imagePaths)
    if (imported.success && imported.data) {
      importedCount += imported.data.importedCount
      skipCount += imported.data.skipCount
      errorCount += imported.data.errorCount
    } else {
      errorCount += classified.imagePaths.length
    }
  }

  for (const folderPath of classified.folderPaths) {
    const existing = galleryStore.roots.find((root) => root.path.toLowerCase() === folderPath.toLowerCase())
    if (existing) await galleryStore.scanRoot(folderPath)
    else await galleryStore.addRoot(folderPath)
  }
  await galleryStore.loadImages(true)
  await refreshVisibleTags()

  const parts = []
  if (importedCount) parts.push(`${importedCount} 张已导入`)
  if (classified.folderPaths.length) parts.push(`${classified.folderPaths.length} 个文件夹已同步`)
  if (skipCount) parts.push(`${skipCount} 张已存在`)
  if (errorCount) parts.push(`${errorCount} 项未读取`)
  appStore.setStatus(parts.join('，') || '没有可读取的图片')
}

async function addRoot() {
  const folderPath = await window.fsAPI.selectFolder()
  if (folderPath) await galleryStore.addRoot(folderPath)
}

async function importImages() {
  const filePaths = await window.fsAPI.selectImages()
  if (!filePaths.length) return

  appStore.setStatus(`正在导入 ${filePaths.length} 张图片…`)
  const response = await window.galleryAPI.importFiles(filePaths)
  if (!response.success || !response.data) {
    appStore.setError(response.error || '图片导入失败')
    return
  }

  galleryStore.activeDatasetId = null
  galleryStore.activeRootId = null
  await galleryStore.loadImages(true)
  await refreshVisibleTags()
  const parts = [`${response.data.importedCount} 张已导入`]
  if (response.data.skipCount) parts.push(`${response.data.skipCount} 张已存在`)
  if (response.data.errorCount) parts.push(`${response.data.errorCount} 张未读取`)
  appStore.setStatus(parts.join('，'))
}

async function scanCurrentRoot() {
  await galleryStore.scanRoot(activeRoot.value?.path)
  await refreshVisibleTags()
}

async function selectRoot(root: LibraryRoot) {
  galleryStore.activeDatasetId = null
  galleryStore.setActiveRoot(root.id)
}

async function selectAllImages() {
  galleryStore.activeDatasetId = null
  galleryStore.setActiveRoot(null)
}

async function selectDataset(folderPath: string) {
  galleryStore.clearSelection()
  galleryStore.loadDatasetImages(folderPath)
}

async function loadThumbnail(imageId: number, element: HTMLImageElement) {
  // 缩略图走 media://：主进程只保证文件存在，图片数据不再经 base64 + IPC 搬运
  if (!window.galleryAPI?.getThumbnailUrl) return
  const response = await window.galleryAPI.getThumbnailUrl(imageId)
  if (!response.success || !response.data?.url) return
  const src = response.data.url
  element.src = src
  gridRef.value?.setThumbSrc(imageId, src)
}

function openMetadata(_image: { id: number }, index: number) {
  droppedViewerImage.value = null
  metadataIndex.value = index
  loadViewerImage()
}

function closeMetadata() {
  metadataIndex.value = null
  droppedViewerImage.value = null
}

async function loadViewerImage() {
  if (metadataIndex.value === null) return
  const image = viewerImages.value[metadataIndex.value]
  if (!image) return
  viewerLoading.value = true
  viewerMetadata.value = { hasMetadata: false }
  viewerTags.value = []
  viewerImageSrc.value = ''
  // 大图直接用 media:// 地址，不再把整张图 base64 化后经 IPC 传过来
  viewerImageSrc.value = toMediaUrl(image.path)
  const [metadataResponse, tagsResponse] = await Promise.all([
    window.galleryAPI.getMetadata(image.id),
    window.galleryAPI.getImageTags(image.id),
  ])
  if (metadataResponse.success && metadataResponse.data) viewerMetadata.value = metadataResponse.data
  if (tagsResponse.success && tagsResponse.data) viewerTags.value = tagsResponse.data
  viewerLoading.value = false
}

function viewerPrevious() {
  if (metadataIndex.value === null || metadataIndex.value <= 0) return
  metadataIndex.value--
  loadViewerImage()
}

function viewerNext() {
  if (metadataIndex.value === null || metadataIndex.value >= viewerImages.value.length - 1) return
  metadataIndex.value++
  loadViewerImage()
}

async function saveViewerTags(tags: { tag: string; confidence?: number; source?: string; weight?: number }[]) {
  if (metadataIndex.value === null || isTemporaryViewer.value) return
  const image = viewerImages.value[metadataIndex.value]
  if (!image) return
  await galleryStore.saveTags(image.id, tags)
  viewerTags.value = galleryStore.imageTags.get(image.id) ?? []
}

function sendViewerImageToTagger() {
  if (metadataIndex.value === null || isTemporaryViewer.value) return
  const image = viewerImages.value[metadataIndex.value]
  if (image) sendImagesToTagger([image])
}

function revealViewerImage() {
  if (metadataIndex.value === null) return
  const image = viewerImages.value[metadataIndex.value]
  if (image) window.shellAPI.openFolder(image.path)
}

function sendImagesToTagger(images: { id: number; path: string }[]) {
  if (images.length === 0) return
  const scrollTop = galleryStore.activeDatasetId ? datasetGridRef.value?.scrollTop ?? 0 : gridRef.value?.getScrollTop() ?? 0
  const handoff = createGalleryHandoff(images.map((image) => ({
    ...image,
    tags: galleryStore.imageTags.get(image.id)?.map((tag) => ({
      tag: tag.tag,
      confidence: tag.confidence ?? 1,
      source: tag.source,
      category: tag.category,
      weight: tag.weight,
    })),
  })), galleryStore.captureReturnContext(scrollTop))
  taggerStore.createQueueFromGallery(handoff)
  router.push('/tagger')
}

function sendSelectedToTagger() {
  sendImagesToTagger(orderedSelectedImages.value)
}

function openDatasetPicker() {
  selectedDataset.value = galleryStore.datasets[0]?.folderPath ?? ''
  datasetDialogMode.value = galleryStore.datasets.length ? 'pick' : 'create'
  showDatasetDialog.value = true
}

function openCreateDataset() {
  datasetDialogMode.value = 'create'
  datasetName.value = ''
  datasetParent.value = ''
  showDatasetDialog.value = true
}

async function chooseDatasetParent() {
  datasetParent.value = await window.fsAPI.selectFolder() || ''
}

async function confirmDatasetDialog() {
  const paths = orderedSelectedImages.value.map((image) => image.path)
  if (datasetDialogMode.value === 'pick') {
    if (!selectedDataset.value) return
    await galleryStore.addToDataset(selectedDataset.value, paths)
  } else {
    if (!datasetName.value.trim() || !datasetParent.value) return
    await galleryStore.createDataset(datasetName.value.trim(), datasetParent.value, paths)
  }
  showDatasetDialog.value = false
}

async function deleteSelectedMedia() {
  if (!confirm(`确定把选中的 ${orderedSelectedImages.value.length} 张图片移入回收站吗？`)) return
  const paths = orderedSelectedImages.value.map((image) => image.path)
  const response = await window.fsAPI.deleteMedia({ filePaths: paths })
  if (!response.success) {
    appStore.setError(response.error || '删除失败')
    return
  }
  galleryStore.clearSelection()
  await galleryStore.loadImages(true)
  appStore.setStatus(`已移入回收站：${response.data?.moved ?? 0} 张`)
}

async function deleteSingleMedia(image: { path: string }) {
  if (!confirm('确定把这张图片移入回收站吗？')) return
  const response = await window.fsAPI.deleteMedia({ filePaths: [image.path] })
  if (!response.success) {
    appStore.setError(response.error || '删除失败')
    return
  }
  galleryStore.clearSelection()
  await galleryStore.loadImages(true)
  appStore.setStatus('已移入回收站')
}

async function onRecycleRestored() {
  await galleryStore.loadImages(true)
  await refreshVisibleTags()
}

function sendGridImageToTagger(image: { id: number; path: string }) {
  sendImagesToTagger([image])
}

function revealGridImage(image: { path: string }) {
  window.shellAPI.openFolder(image.path)
}

function openFileDialog() {
  fileOperation.value = 'copy'
  fileDestination.value = ''
  fileOperationError.value = ''
  showFileDialog.value = true
}

function openBatchTagDialog() {
  showBatchTagDialog.value = true
}

function openBatchToolsDialog() {
  showBatchToolsDialog.value = true
}

function openCharacterAuditDialog() {
  showCharacterAuditDialog.value = true
}

const organizeAvailableTags = computed(() => {
  const counts = new Map<string, number>()
  for (const image of orderedSelectedImages.value) {
    const tags = galleryStore.imageTags.get(image.id) ?? []
    for (const tag of tags) counts.set(tag.tag, (counts.get(tag.tag) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
})

function openOrganizeDialog() {
  showOrganizeDialog.value = true
}

function sanitizeFolderName(tag: string) {
  return tag.replace(/[\\/:*?"<>|]/g, '_').trim() || '未分类'
}

async function confirmOrganize(params: { tags: string[]; destFolder: string; keepOriginal: boolean }) {
  const sourceImages = orderedSelectedImages.value
  if (sourceImages.length === 0) return

  const allMappings: { oldPath: string; newPath: string }[] = []
  let movedCount = 0
  let failedCount = 0

  for (const tag of params.tags) {
    const matches = sourceImages.filter((image) => {
      const tags = galleryStore.imageTags.get(image.id) ?? []
      return tags.some((item) => item.tag.toLowerCase() === tag.toLowerCase())
    })
    if (matches.length === 0) continue

    const subFolder = params.destFolder.replace(/[/\\]$/, '') + '\\' + sanitizeFolderName(tag)
    const response = await window.fsAPI.moveImages({
      filePaths: matches.map((image) => image.path),
      destFolder: subFolder,
      keepOriginal: params.keepOriginal,
    })
    if (!response.success) {
      failedCount += response.data?.failures?.length ?? matches.length
      continue
    }
    movedCount += response.data?.moved ?? 0
    for (const result of response.data?.results ?? []) {
      allMappings.push({ oldPath: result.oldPath, newPath: result.newPath })
    }
  }

  if (!params.keepOriginal && allMappings.length > 0) {
    const databaseResponse = await window.galleryAPI.updateImagePaths(allMappings)
    if (databaseResponse.success) {
      galleryStore.replaceImagePaths(allMappings)
      taggerStore.replacePaths(allMappings)
    }
  }

  showOrganizeDialog.value = false
  galleryStore.clearSelection()
  if (failedCount > 0) {
    appStore.setStatus(`归集完成：${movedCount} 张成功，${failedCount} 张失败`)
  } else {
    appStore.setStatus(`归集完成：${movedCount} 张`)
  }
}

async function onBatchTagsApplied() {
  await refreshVisibleTags()
}

async function chooseFileDestination() {
  fileDestination.value = await window.fsAPI.selectFolder() || ''
}

async function confirmFileOperation() {
  const sourcePaths = orderedSelectedImages.value.map((image) => image.path)
  if (!fileDestination.value || sourcePaths.length === 0) return
  fileOperationBusy.value = true
  fileOperationError.value = ''
  const response = await window.fsAPI.moveImages({
    filePaths: sourcePaths,
    destFolder: fileDestination.value,
    keepOriginal: fileOperation.value === 'copy',
  })
  if (!response.success || !response.data?.destPaths) {
    fileOperationError.value = response.error || '文件操作失败。'
    fileOperationBusy.value = false
    return
  }

  if (fileOperation.value === 'move') {
    const mappings = sourcePaths.map((oldPath, index) => ({ oldPath, newPath: response.data!.destPaths![index] }))
    const databaseResponse = await window.galleryAPI.updateImagePaths(mappings)
    if (!databaseResponse.success) {
      fileOperationError.value = `文件已经移动，但图库记录更新失败：${databaseResponse.error || '未知错误'}。请同步图库后再继续。`
      fileOperationBusy.value = false
      return
    }
    galleryStore.replaceImagePaths(mappings)
    taggerStore.replacePaths(mappings)
  }

  galleryStore.clearSelection()
  showFileDialog.value = false
  fileOperationBusy.value = false
}

async function importDataset() {
  const folderPath = await window.fsAPI.selectFolder()
  if (!folderPath) return
  const files = await window.fsAPI.listImages(folderPath)
  const paths = Array.isArray(files) ? files.map((file: any) => file.path) : []
  const name = folderPath.split(/[/\\]/).pop() || folderPath
  await ensureDatasetIndexed(folderPath)
  galleryStore.importFolderDataset(name, folderPath, paths)
}

function editDatasetItem(item: any) {
  editingDatasetItem.value = item
  datasetCaption.value = item.caption || ''
}

async function saveDatasetCaption() {
  if (!editingDatasetItem.value) return
  await galleryStore.saveDatasetCaption(editingDatasetItem.value, datasetCaption.value)
  editingDatasetItem.value = null
}

async function ensureDatasetIndexed(folderPath: string) {
  let root = galleryStore.roots.find((item) => item.path.toLowerCase() === folderPath.toLowerCase())
  if (!root) {
    await galleryStore.addRoot(folderPath)
    root = galleryStore.roots.find((item) => item.path.toLowerCase() === folderPath.toLowerCase())
  }
  const indexedByPath = new Map<string, GalleryImage>()
  if (!root) return indexedByPath

  let offset = 0
  const limit = 500
  while (true) {
    const response = await window.galleryAPI.getImages({ rootId: root.id, limit, offset })
    if (!response.success || !response.data) break
    response.data.forEach((image) => indexedByPath.set(image.path.toLowerCase(), image))
    if (response.data.length < limit) break
    offset += response.data.length
  }
  return indexedByPath
}

async function sendDatasetToTagger() {
  if (!activeDataset.value) return
  datasetSendError.value = ''
  const indexedByPath = await ensureDatasetIndexed(activeDataset.value.folderPath)
  const missing: string[] = []
  const items = galleryStore.datasetImageItems.flatMap((item) => {
    const indexed = indexedByPath.get(item.path.toLowerCase())
    if (!indexed) { missing.push(item.filename); return [] }
    return [{ id: indexed.id, path: indexed.path }]
  })
  if (missing.length) {
    datasetSendError.value = `${missing.length} 张图片没有完成图库索引，请先同步数据集文件夹。`
    return
  }
  sendImagesToTagger(items)
}

async function sendDatasetToTraining() {
  if (!activeDataset.value) return
  const items = galleryStore.datasetImageItems
  const validity = await Promise.all(items.map(item => window.fsAPI.exists(item.path)))
  const captionedCount = items.filter(item => item.hasCaption && item.caption.trim()).length
  localStorage.setItem('baka-training-dataset-handoff', JSON.stringify({
    datasetPath: activeDataset.value.folderPath,
    datasetName: activeDataset.value.name,
    imageCount: items.length,
    captionedCount,
    missingCaptionCount: items.length - captionedCount,
    invalidCount: validity.filter(exists => !exists).length,
    createdAt: new Date().toISOString(),
  }))
  localStorage.setItem('baka-training-mode', 'advanced')
  router.push('/training')
}

function revealSelected() {
  if (selectedImage.value) window.shellAPI.openFolder(selectedImage.value.path)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (metadataIndex.value !== null) closeMetadata()
  else galleryStore.clearSelection()
}

watch(() => galleryStore.images.length, refreshVisibleTags)
watch(selectedImage, (image) => { if (image) galleryStore.fetchTags(image.id) })

/** 从首页拍立得点进来：?focus=<imageId>，找到这张图、选中并滚到它那里闪一下。 */
const MAX_FOCUS_PAGES = 20
async function focusImageFromQuery() {
  const raw = route.query.focus
  const imageId = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isFinite(imageId) || imageId <= 0) return false
  // 首页显示的是全库最新图片，所以先回到“全部图片”、清掉筛选，保证它能出现在列表里
  if (galleryStore.activeDatasetId || galleryStore.activeRootId || galleryStore.searchQuery || galleryStore.tagStateFilter !== 'all') {
    galleryStore.activeDatasetId = null
    galleryStore.searchQuery = ''
    galleryStore.tagStateFilter = 'all'
    galleryStore.setActiveRoot(null)
    await galleryStore.loadImages(true)
  }
  let pages = 0
  while (!galleryStore.images.some((image) => image.id === imageId) && galleryStore.hasMore && pages < MAX_FOCUS_PAGES) {
    await galleryStore.loadMore()
    pages++
  }
  const target = galleryStore.images.find((image) => image.id === imageId)
  // 清掉地址里的 focus，避免刷新/返回时反复定位
  void router.replace({ path: '/gallery' })
  if (!target) {
    appStore.setStatus('这张图片不在当前图库里')
    return false
  }
  galleryStore.clearSelection()
  galleryStore.toggleSelect(target.id)
  await nextTick()
  await refreshVisibleTags()
  requestAnimationFrame(() => gridRef.value?.focusImage(target.id))
  return true
}

onMounted(async () => {
  galleryStore.setupScanListener()
  await galleryStore.loadRoots()
  if (galleryStore.activeDatasetId) {
    galleryStore.loadDatasetImages(galleryStore.activeDatasetId)
  } else {
    await galleryStore.loadImages(true)
    await refreshVisibleTags()
  }
  const focused = await focusImageFromQuery()
  if (!focused && galleryStore.pendingScrollTop) {
    await nextTick()
    if (galleryStore.activeDatasetId && datasetGridRef.value) datasetGridRef.value.scrollTop = galleryStore.pendingScrollTop
    else gridRef.value?.restoreScroll(galleryStore.pendingScrollTop)
    galleryStore.pendingScrollTop = 0
  }
  window.addEventListener('keydown', onKeydown)
})

watch(() => route.query.focus, (value) => { if (value) void focusImageFromQuery() })

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <main
    class="gallery-page"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <section class="gallery-workspace">
      <div v-if="isDragOver" class="gallery-drag-overlay">
        <div><strong>松开以读取图片或文件夹</strong><span>单张查看元数据 · 多张导入图库 · 文件夹自动同步</span></div>
      </div>
      <GallerySidebar
        :roots="galleryStore.roots"
        :datasets="galleryStore.datasets"
        :active-root-id="galleryStore.activeRootId"
        :active-dataset-id="galleryStore.activeDatasetId"
        @select-all="selectAllImages"
        @select-root="selectRoot"
        @select-dataset="selectDataset"
        @import-dataset="importDataset"
        @create-dataset="openCreateDataset"
        @open-recycle="showRecycleDialog = true"
      />

      <div class="gallery-content">
        <GalleryToolbar
          v-if="!galleryStore.activeDatasetId"
          :title="activeRoot?.label || '全部图片'"
          :search="galleryStore.searchQuery"
          :tag-state="galleryStore.tagStateFilter"
          :sort="galleryStore.sortMode"
          :view-mode="viewMode"
          :image-count="visibleImages.length"
          :scanning="galleryStore.isScanning"
          @scan="scanCurrentRoot"
          @add-root="addRoot"
          @import-images="importImages"
          @update:search="galleryStore.searchQuery = $event"
          @update:tag-state="galleryStore.tagStateFilter = $event"
          @update:sort="galleryStore.sortMode = $event"
          @update:view-mode="viewMode = $event"
        />

        <div v-if="galleryStore.activeDatasetId" class="dataset-toolbar">
          <div><strong>{{ activeDataset?.name }}</strong><span>{{ galleryStore.datasetImageItems.length }} 张 · {{ galleryStore.datasetImageItems.filter((item) => item.hasCaption).length }} 张已标注</span></div>
          <span v-if="datasetSendError" class="dataset-toolbar__error">{{ datasetSendError }}</span>
          <button @click="galleryStore.exportDatasetCaptions(galleryStore.activeDatasetId)">导出 captions</button>
          <button class="primary" :disabled="galleryStore.datasetImageItems.length === 0" @click="sendDatasetToTagger">全部送去标注</button>
          <button class="primary" :disabled="galleryStore.datasetImageItems.length === 0" @click="sendDatasetToTraining">用于训练</button>
        </div>

        <div class="gallery-stage">
          <GalleryGrid
            v-if="!galleryStore.activeDatasetId"
            ref="gridRef"
            :images="visibleImages"
            :selected-ids="galleryStore.selectedIds"
            :image-tags="galleryStore.imageTags"
            :is-loading="galleryStore.isLoading"
            :is-scanning="galleryStore.isScanning"
            :has-more="galleryStore.hasMore"
            :view-mode="viewMode"
            @select="galleryStore.toggleSelect($event.id)"
            @toggle="galleryStore.toggleSelect($event.id, true)"
            @range-select="galleryStore.selectRange($event.id)"
            @open-metadata="openMetadata"
            @scroll-end="galleryStore.loadMore"
            @request-thumb="loadThumbnail"
            @send-to-tagger="sendGridImageToTagger"
            @reveal="revealGridImage"
            @delete="deleteSingleMedia"
          />

          <div v-else ref="datasetGridRef" class="dataset-grid">
            <article v-for="item in galleryStore.datasetImageItems" :key="item.path" class="dataset-card" role="button" tabindex="0" @click="editDatasetItem(item)" @keydown.enter="editDatasetItem(item)">
              <div class="dataset-card__image">
                <img v-if="item.thumb" :src="item.thumb" :alt="item.filename" />
                <i v-else>IMG</i>
              </div>
              <strong>{{ item.filename }}</strong>
              <small>{{ item.caption || '未标注，点击编辑' }}</small>
            </article>
            <div v-if="galleryStore.datasetImageItems.length === 0" class="dataset-empty"><strong>这个数据集还是空的</strong><span>从图库选择图片后，可以通过底部操作栏加入这里。</span></div>
          </div>

          <GalleryInspector
            v-if="selectedImage && !galleryStore.activeDatasetId"
            :image="selectedImage"
            :tags="selectedTags"
            :preview="selectedPreview"
            :metadata="selectedMetadata"
            @open-metadata="selectedImage && openMetadata(selectedImage, visibleImages.indexOf(selectedImage))"
            @send-to-tagger="sendSelectedToTagger"
            @batch-tools="openBatchToolsDialog"
            @audit="openCharacterAuditDialog"
            @delete="deleteSelectedMedia"
            @reveal="revealSelected"
          />

          <GallerySelectionBar
            v-if="galleryStore.selectedCount > 1"
            :count="galleryStore.selectedCount"
            :has-datasets="galleryStore.datasets.length > 0"
            @send-to-tagger="sendSelectedToTagger"
            @add-to-dataset="openDatasetPicker"
            @copy-move="openFileDialog"
            @organize="openOrganizeDialog"
            @edit-tags="openBatchTagDialog"
            @batch-tools="openBatchToolsDialog"
            @audit="openCharacterAuditDialog"
            @delete="deleteSelectedMedia"
            @clear="galleryStore.clearSelection"
          />
        </div>
      </div>
    </section>

    <MetadataViewer
      :visible="metadataIndex !== null"
      :images="viewerImages"
      :image-index="metadataIndex ?? 0"
      :metadata="viewerMetadata"
      :tags="viewerTags"
      :image-src="viewerImageSrc"
      :loading="viewerLoading"
      :read-only="isTemporaryViewer"
      @close="closeMetadata"
      @previous="viewerPrevious"
      @next="viewerNext"
      @send-to-tagger="sendViewerImageToTagger"
      @reveal="revealViewerImage"
      @save-tags="saveViewerTags"
    />

    <Teleport to="body">
      <div v-if="showDatasetDialog" class="dialog-backdrop" @click.self="showDatasetDialog = false">
        <section class="dialog-card">
          <div><p>DATASET</p><h2>{{ datasetDialogMode === 'pick' ? '加入数据集' : '新建数据集' }}</h2></div>
          <div class="dialog-tabs"><button :class="{ active: datasetDialogMode === 'pick' }" :disabled="!galleryStore.datasets.length" @click="datasetDialogMode = 'pick'">选择已有</button><button :class="{ active: datasetDialogMode === 'create' }" @click="datasetDialogMode = 'create'">新建</button></div>
          <div v-if="datasetDialogMode === 'pick'" class="dataset-options">
            <button v-for="dataset in galleryStore.datasets" :key="dataset.folderPath" :class="{ active: selectedDataset === dataset.folderPath }" @click="selectedDataset = dataset.folderPath"><span>{{ dataset.name }}</span><small>{{ dataset.imagePaths.length }} 张</small></button>
          </div>
          <div v-else class="dialog-fields">
            <label>名称<input v-model="datasetName" placeholder="例如：角色正面图" /></label>
            <label>保存位置<button class="folder-picker" @click="chooseDatasetParent">{{ datasetParent || '选择文件夹' }}</button></label>
          </div>
          <footer><button @click="showDatasetDialog = false">取消</button><button class="primary" @click="confirmDatasetDialog">确认</button></footer>
        </section>
      </div>

      <div v-if="editingDatasetItem" class="dialog-backdrop" @click.self="editingDatasetItem = null">
        <section class="dialog-card dialog-card--caption">
          <div><p>CAPTION</p><h2>{{ editingDatasetItem?.filename }}</h2></div>
          <textarea v-model="datasetCaption" rows="8" placeholder="用英文逗号分隔标签"></textarea>
          <footer><button @click="editingDatasetItem = null">取消</button><button class="primary" @click="saveDatasetCaption">保存 caption</button></footer>
        </section>
      </div>

      <div v-if="showFileDialog" class="dialog-backdrop" @click.self="!fileOperationBusy && (showFileDialog = false)">
        <section class="dialog-card">
          <div><p>FILE OPERATION</p><h2>复制或移动 {{ galleryStore.selectedCount }} 张图片</h2></div>
          <div class="operation-options">
            <button :class="{ active: fileOperation === 'copy' }" @click="fileOperation = 'copy'"><strong>复制</strong><span>保留原图，并复制同名 caption</span></button>
            <button :class="{ active: fileOperation === 'move' }" @click="fileOperation = 'move'"><strong>移动</strong><span>更新图库和未完成标注任务中的路径</span></button>
          </div>
          <button class="destination-picker" @click="chooseFileDestination">{{ fileDestination || '选择目标文件夹' }}</button>
          <p v-if="fileOperation === 'move'" class="move-warning">移动会改变原图位置；确认后图库记录与标注队列会一起更新。</p>
          <p v-if="fileOperationError" class="operation-error">{{ fileOperationError }}</p>
          <footer><button :disabled="fileOperationBusy" @click="showFileDialog = false">取消</button><button class="primary" :disabled="!fileDestination || fileOperationBusy" @click="confirmFileOperation">{{ fileOperationBusy ? '处理中…' : `确认${fileOperation === 'copy' ? '复制' : '移动'}` }}</button></footer>
        </section>
      </div>

      <BatchTagDialog
        :visible="showBatchTagDialog"
        :image-ids="orderedSelectedImages.map((image) => image.id)"
        @close="showBatchTagDialog = false"
        @applied="onBatchTagsApplied"
      />
      <BatchTagToolsDialog
        :visible="showBatchToolsDialog"
        :image-paths="orderedSelectedImages.map((image) => image.path)"
        @close="showBatchToolsDialog = false"
        @applied="onBatchTagsApplied"
      />
      <RecycleBinDialog
        ref="recycleDialogRef"
        :visible="showRecycleDialog"
        @close="showRecycleDialog = false"
        @restored="onRecycleRestored"
      />
      <CharacterTagAuditDialog
        :visible="showCharacterAuditDialog"
        :image-ids="orderedSelectedImages.map((image) => image.id)"
        @close="showCharacterAuditDialog = false"
        @applied="onBatchTagsApplied"
      />
      <OrganizeByTagDialog
        :visible="showOrganizeDialog"
        :count="galleryStore.selectedCount"
        :available-tags="organizeAvailableTags"
        @close="showOrganizeDialog = false"
        @organize="confirmOrganize"
      />
    </Teleport>
  </main>
</template>

<style scoped>
.gallery-page { height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 4px 4px 8px 6px; color: var(--ink-primary); overflow: hidden; }
.gallery-workspace { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 14px; overflow: hidden; }
.gallery-drag-overlay { position: absolute; inset: 0; z-index: 80; display: grid; place-items: center; pointer-events: none; border-radius: var(--radius-hero); outline: 3px dashed var(--brand-primary); outline-offset: -12px; background: rgba(255, 242, 248, .82); backdrop-filter: blur(10px); }
.gallery-drag-overlay div { display: grid; gap: 7px; padding: 22px 30px; color: var(--ink-tertiary); text-align: center; }
.gallery-drag-overlay strong { color: var(--brand-hover); font-size: 18px; font-weight: 900; }
.gallery-drag-overlay span { font-size: 12px; }
.gallery-content { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.gallery-stage { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 14px; overflow: hidden; }
.gallery-stage :deep(.gallery-grid-scroll) { flex: 1; min-width: 0; }
.dataset-toolbar { height: 50px; flex: 0 0 50px; display: flex; align-items: center; gap: 8px; margin: 0 4px 12px; padding: 0 8px 0 18px; border-radius: var(--radius-pill); background: var(--surface-primary); box-shadow: var(--surface-shadow); }
.dataset-toolbar div { margin-right: auto; display: flex; align-items: baseline; gap: 9px; }
.dataset-toolbar strong { font-size: 14px; font-weight: 900; }
.dataset-toolbar span { color: var(--ink-tertiary); font-size: 11px; font-family: var(--font-mono); }
.dataset-toolbar__error { color: var(--danger-foreground); font-size: 11px; }
.dataset-toolbar button { height: 34px; padding: 0 14px; border: 0; border-radius: var(--radius-pill); background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; }
.dataset-toolbar button:hover { background: var(--brand-soft); color: var(--brand-hover); }
.dataset-toolbar button.primary, .dialog-card .primary { background: var(--brand-gradient); color: var(--brand-on-primary); box-shadow: 0 10px 22px rgba(var(--brand-primary-rgb), .3); }
.dataset-toolbar button:disabled { opacity: .45; cursor: not-allowed; }
.dataset-grid { flex: 1; min-width: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); align-content: start; gap: 14px; padding: 6px 10px 90px 6px; }
.dataset-card { display: flex; flex-direction: column; width: 100%; min-width: 0; min-height: 280px; padding: 0; overflow: hidden; border: 0; border-radius: 22px; background: var(--surface-primary); box-shadow: 0 8px 18px rgba(74,45,61,.08); color: var(--ink-secondary); text-align: left; cursor: pointer; transition: transform .25s var(--ease-bounce), box-shadow .2s ease; }
.dataset-card:hover { transform: translateY(-3px); box-shadow: var(--surface-shadow-lg); }
.dataset-card__image { position: relative; flex: 0 0 220px; width: 100%; height: 220px; min-height: 220px; overflow: hidden; background: var(--surface-tertiary); display: grid; place-items: center; }
.dataset-card__image img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.dataset-card__image i { color: var(--ink-tertiary); font-size: 10px; font-style: normal; }
.dataset-card strong, .dataset-card small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 9px 12px 0; font-size: 12px; }
.dataset-card strong { color: var(--ink-primary); font-weight: 800; }
.dataset-card small { padding: 4px 12px 11px; color: var(--ink-tertiary); font-size: 10.5px; }
.dataset-empty { grid-column: 1/-1; min-height: 340px; display: grid; place-content: center; gap: 8px; color: var(--ink-tertiary); text-align: center; font-size: 12px; }
.dataset-empty strong { color: var(--ink-primary); font-size: 16px; font-weight: 900; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; padding: 20px; background: rgba(74, 45, 61, .32); backdrop-filter: blur(9px); }
.dialog-card { width: min(440px, 100%); padding: 24px; border: 0; border-radius: 26px; background: var(--surface-primary); box-shadow: 0 30px 80px rgba(255, 126, 182, .28); color: var(--ink-primary); }
.dialog-card p { margin: 0 0 4px; color: var(--brand-primary); font-family: var(--font-mono); font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.dialog-card h2 { margin: 0; font-size: 19px; font-weight: 900; }
.dialog-tabs { display: flex; gap: 4px; margin: 20px 0 12px; padding: 4px; border-radius: var(--radius-pill); background: var(--surface-secondary); }
.dialog-tabs button { flex: 1; height: 34px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--ink-tertiary); cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 700; }
.dialog-tabs button.active { background: var(--surface-primary); color: var(--brand-hover); box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), .18); }
.dataset-options { display: grid; gap: 6px; max-height: 220px; overflow: auto; }
.dataset-options button { display: flex; justify-content: space-between; padding: 12px 14px; border: 2px solid transparent; border-radius: 16px; background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-weight: 700; }
.dataset-options button.active { border-color: var(--brand-primary); background: var(--brand-tint); color: var(--ink-primary); }
.dataset-options small { color: var(--ink-tertiary); font-family: var(--font-mono); }
.dialog-fields { display: grid; gap: 13px; margin-top: 18px; }
.dialog-fields label { display: grid; gap: 6px; color: var(--ink-tertiary); font-size: 11.5px; font-weight: 700; }
.dialog-fields input, .folder-picker, .dialog-card textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--line-subtle); border-radius: 14px; background: var(--surface-primary); color: var(--ink-primary); outline: none; font: inherit; font-size: 13px; }
.dialog-fields input:focus, .dialog-card textarea:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 4px var(--brand-soft); }
.dialog-fields input, .folder-picker { height: 38px; padding: 0 12px; text-align: left; cursor: text; }
.folder-picker { cursor: pointer; color: var(--ink-secondary); }
.dialog-card textarea { margin-top: 18px; padding: 12px; resize: vertical; line-height: 1.6; }
.dialog-card footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.dialog-card footer button { height: 36px; padding: 0 16px; border: 0; border-radius: var(--radius-pill); background: var(--surface-secondary); color: var(--ink-secondary); cursor: pointer; font: inherit; font-size: 12.5px; font-weight: 700; }
.dialog-card footer button:disabled { opacity: .45; cursor: not-allowed; }
.operation-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 18px; }
.operation-options button { display: grid; gap: 4px; padding: 12px 14px; border: 2px solid transparent; border-radius: 16px; background: var(--surface-secondary); color: var(--ink-tertiary); text-align: left; cursor: pointer; font: inherit; }
.operation-options button.active { border-color: var(--brand-primary); background: var(--brand-tint); }
.operation-options strong { color: var(--ink-primary); font-size: 12.5px; font-weight: 800; }
.operation-options span { font-size: 10.5px; line-height: 1.5; }
.destination-picker { width: 100%; height: 40px; margin-top: 10px; padding: 0 14px; overflow: hidden; border: 1px solid var(--line-subtle); border-radius: 14px; background: var(--surface-primary); color: var(--ink-secondary); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; font: inherit; font-size: 12.5px; }
.move-warning, .operation-error { margin: 10px 0 0; padding: 9px 12px; border-radius: 12px; background: var(--accent-peach-soft); color: var(--accent-peach-strong); font-size: 11px; line-height: 1.55; }
.operation-error { background: var(--danger-bg); color: var(--danger-foreground); }
@media (max-width: 980px) { .gallery-stage :deep(.gallery-inspector) { position: absolute; top: 10px; right: 10px; bottom: 10px; z-index: 20; width: min(280px, calc(100% - 20px)); box-shadow: var(--surface-shadow-lg); } }
@media (max-width: 760px) { .gallery-page { padding: 6px; overflow-x: hidden; } .gallery-workspace { gap: 8px; } }
</style>

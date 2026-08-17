<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import GallerySidebar from '@/components/tagger/GallerySidebar.vue'
import GalleryToolbar from '@/components/tagger/GalleryToolbar.vue'
import GalleryGrid from '@/components/tagger/GalleryGrid.vue'
import GalleryInspector from '@/components/tagger/GalleryInspector.vue'
import GallerySelectionBar from '@/components/tagger/GallerySelectionBar.vue'
import BatchTagDialog from '@/components/tagger/BatchTagDialog.vue'
import RecycleBinDialog from '@/components/tagger/RecycleBinDialog.vue'
import MetadataViewer from '@/components/tagger/MetadataViewer.vue'
import CharacterTagAuditDialog from '@/components/tagger/CharacterTagAuditDialog.vue'
import OrganizeByTagDialog from '@/components/tagger/OrganizeByTagDialog.vue'
import { createGalleryHandoff } from '@/features/gallery/gallery-workflow'
import { parseSearchQuery, matchesQuery } from '@/features/gallery/tag-filter'
import { useAppStore } from '@/stores/app'
import { useGalleryStore } from '@/stores/gallery'
import { useTaggerStore } from '@/stores/tagger'

const router = useRouter()
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
  const [metadataResponse, imageResponse] = await Promise.all([
    window.galleryAPI.readFileMeta(filePath),
    window.fsAPI.readImageBase64(filePath),
  ])
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
  if (imageResponse.success && imageResponse.base64) {
    viewerImageSrc.value = `data:${imageResponse.mime || 'image/png'};base64,${imageResponse.base64}`
  }
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
  const response = await window.galleryAPI.getThumbnail(imageId)
  if (!response.success || !response.data?.base64) return
  const src = `data:image/jpeg;base64,${response.data.base64}`
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
  const [metadataResponse, tagsResponse, imageResponse] = await Promise.all([
    window.galleryAPI.getMetadata(image.id),
    window.galleryAPI.getImageTags(image.id),
    window.fsAPI.readImageBase64(image.path),
  ])
  if (metadataResponse.success && metadataResponse.data) viewerMetadata.value = metadataResponse.data
  if (tagsResponse.success && tagsResponse.data) viewerTags.value = tagsResponse.data
  if (imageResponse.success && imageResponse.base64) {
    viewerImageSrc.value = `data:${imageResponse.mime || 'image/png'};base64,${imageResponse.base64}`
  }
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

onMounted(async () => {
  galleryStore.setupScanListener()
  await galleryStore.loadRoots()
  if (galleryStore.activeDatasetId) {
    galleryStore.loadDatasetImages(galleryStore.activeDatasetId)
  } else {
    await galleryStore.loadImages(true)
    await refreshVisibleTags()
  }
  if (galleryStore.pendingScrollTop) {
    await nextTick()
    if (galleryStore.activeDatasetId && datasetGridRef.value) datasetGridRef.value.scrollTop = galleryStore.pendingScrollTop
    else gridRef.value?.restoreScroll(galleryStore.pendingScrollTop)
    galleryStore.pendingScrollTop = 0
  }
  window.addEventListener('keydown', onKeydown)
})

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
            <button v-for="item in galleryStore.datasetImageItems" :key="item.path" class="dataset-card" @click="editDatasetItem(item)">
              <span class="dataset-card__image"><img v-if="item.thumb" :src="item.thumb" :alt="item.filename" /><i v-else>IMG</i></span>
              <strong>{{ item.filename }}</strong>
              <small>{{ item.caption || '未标注，点击编辑' }}</small>
            </button>
            <div v-if="galleryStore.datasetImageItems.length === 0" class="dataset-empty"><strong>这个数据集还是空的</strong><span>从图库选择图片后，可以通过底部操作栏加入这里。</span></div>
          </div>

          <GalleryInspector
            v-if="galleryStore.selectedCount === 1"
            :image="selectedImage!"
            :tags="selectedTags"
            @open-metadata="openMetadata(selectedImage!, visibleImages.indexOf(selectedImage!))"
            @send-to-tagger="sendSelectedToTagger"
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
          <div><p>CAPTION</p><h2>{{ editingDatasetItem.filename }}</h2></div>
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
.gallery-page { height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 6px 10px 10px; color: var(--text-primary); overflow: hidden; }
.dialog-card p { margin: 0 0 2px; color: var(--accent-primary); font-size: 8px; font-weight: 750; letter-spacing: .16em; }.dataset-toolbar button { height: 30px; padding: 0 11px; border: 1px solid rgba(255,255,255,.075); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: 9px; }.dataset-toolbar button.primary, .dialog-card .primary { border-color: transparent; background: var(--accent-primary); color: white; font-weight: 700; }
.gallery-workspace { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 14px; overflow: hidden; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.gallery-drag-overlay { position: absolute; inset: 0; z-index: 80; display: grid; place-items: center; pointer-events: none; border: 0; border-radius: 14px; outline: 2px dashed color-mix(in srgb, var(--brand-primary) 62%, transparent); outline-offset: -10px; background: color-mix(in srgb, var(--surface-secondary) 78%, transparent); backdrop-filter: blur(10px); }.gallery-drag-overlay div { display: grid; gap: 7px; padding: 22px 30px; color: var(--text-tertiary); text-align: center; }.gallery-drag-overlay strong { color: var(--accent-primary); font-size: 16px; }.gallery-drag-overlay span { font-size: 9px; }
.gallery-content { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }.gallery-stage { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; gap: 12px; overflow: hidden; }.gallery-stage :deep(.gallery-grid-scroll) { flex: 1; min-width: 0; }
.dataset-toolbar { height: 44px; flex: 0 0 44px; display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 0 10px; border: 0; border-radius: 10px; background: color-mix(in srgb, var(--surface-secondary) 72%, transparent); }.dataset-toolbar div { margin-right: auto; display: flex; align-items: baseline; gap: 9px; }.dataset-toolbar strong { font-size: 12px; }.dataset-toolbar span { color: var(--text-tertiary); font-size: 9px; }
.dataset-grid { flex: 1; min-width: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); align-content: start; gap: 12px; padding: 12px 12px 90px; }.dataset-card { min-width: 0; padding: 0; overflow: hidden; border: 1px solid rgba(255,255,255,.07); border-radius: 11px; background: rgba(255,255,255,.025); color: var(--text-secondary); text-align: left; cursor: pointer; }.dataset-card__image { display: grid; place-items: center; aspect-ratio: 1.35; background: #16151b; }.dataset-card__image img { width: 100%; height: 100%; object-fit: cover; }.dataset-card__image i { color: var(--text-tertiary); font-size: 10px; font-style: normal; }.dataset-card strong, .dataset-card small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 8px 9px 0; font-size: 10px; }.dataset-card small { padding: 4px 9px 9px; color: var(--text-tertiary); font-size: 8px; }.dataset-empty { grid-column: 1/-1; min-height: 340px; display: grid; place-content: center; gap: 8px; color: var(--text-tertiary); text-align: center; font-size: 11px; }.dataset-empty strong { color: var(--text-secondary); font-size: 15px; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; padding: 20px; background: rgba(7,6,9,.68); backdrop-filter: blur(9px); }.dialog-card { width: min(440px, 100%); padding: 22px; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; background: #1c1921; box-shadow: 0 30px 80px rgba(0,0,0,.48); }.dialog-card h2 { margin: 0; font-size: 19px; }.dialog-tabs { display: flex; gap: 4px; margin: 20px 0 12px; padding: 3px; border-radius: 9px; background: rgba(255,255,255,.03); }.dialog-tabs button { flex: 1; height: 32px; border: 0; border-radius: 7px; background: transparent; color: var(--text-tertiary); cursor: pointer; }.dialog-tabs button.active { background: rgba(var(--accent-primary-rgb),.12); color: var(--accent-primary); }.dataset-options { display: grid; gap: 6px; max-height: 220px; overflow: auto; }.dataset-options button { display: flex; justify-content: space-between; padding: 11px; border: 1px solid rgba(255,255,255,.06); border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; }.dataset-options button.active { border-color: rgba(var(--accent-primary-rgb),.45); background: rgba(var(--accent-primary-rgb),.08); }.dataset-options small { color: var(--text-tertiary); }.dialog-fields { display: grid; gap: 13px; margin-top: 18px; }.dialog-fields label { display: grid; gap: 6px; color: var(--text-tertiary); font-size: 9px; }.dialog-fields input, .folder-picker, .dialog-card textarea { box-sizing: border-box; width: 100%; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-primary); outline: none; font: inherit; }.dialog-fields input, .folder-picker { height: 36px; padding: 0 10px; text-align: left; }.dialog-card textarea { margin-top: 18px; padding: 11px; resize: vertical; line-height: 1.6; }.dialog-card footer { display: flex; justify-content: flex-end; gap: 7px; margin-top: 20px; }.dialog-card footer button { height: 34px; padding: 0 15px; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.035); color: var(--text-secondary); cursor: pointer; }
.operation-options { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 18px; }.operation-options button { display: grid; gap: 4px; padding: 12px; border: 1px solid rgba(255,255,255,.07); border-radius: 9px; background: rgba(255,255,255,.02); color: var(--text-tertiary); text-align: left; cursor: pointer; }.operation-options button.active { border-color: rgba(var(--accent-primary-rgb),.4); background: rgba(var(--accent-primary-rgb),.07); }.operation-options strong { color: var(--text-secondary); font-size: 10px; }.operation-options span { font-size: 8px; line-height: 1.5; }.destination-picker { width: 100%; height: 38px; margin-top: 10px; padding: 0 11px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; background: rgba(255,255,255,.03); color: var(--text-secondary); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }.move-warning, .operation-error { margin: 10px 0 0; padding: 8px 9px; border-radius: 7px; background: rgba(255,193,132,.055); color: #ffc184; font-size: 8px; line-height: 1.55; }.operation-error { background: rgba(255,137,117,.055); color: #ff9a86; }
@media (max-width: 980px) { .gallery-stage :deep(.gallery-inspector) { position: absolute; top: 10px; right: 10px; bottom: 10px; z-index: 20; width: min(280px, calc(100% - 20px)); box-shadow: 0 18px 44px rgba(0,0,0,.28); } }
@media (max-width: 760px) { .gallery-page { padding: 8px; overflow-x: hidden; }.gallery-workspace { gap: 8px; } }
</style>

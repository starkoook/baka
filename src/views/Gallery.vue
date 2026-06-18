<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGalleryStore } from '@/stores/gallery'
import { useAppStore } from '@/stores/app'

const galleryStore = useGalleryStore()
const appStore = useAppStore()
const router = useRouter()

// ── Drag & drop for quick metadata reading ──
const isDragOver = ref(false)

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  isDragOver.value = true
}
function onDragLeave() { isDragOver.value = false }

async function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  // Modern Electron: use webUtils.getPathForFile via preload
  const filePath = window.galleryAPI?.getFilePath(file)
  if (!filePath) return
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext || !['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
    appStore.setStatus('不支持的文件格式')
    return
  }

  appStore.setStatus('正在读取...')
  if (!window.galleryAPI) return

  // Read via path-based IPC
  const res = await window.galleryAPI.readFileMeta(filePath)
  if (res.success && res.data) {
    // Create temp image object for modal display
    const img: GalleryImage = {
      id: -1, path: filePath, filename: file.name,
      dirname: '', root_id: null,
      width: res.data.width || 0, height: res.data.height || 0,
      file_size: file.size, file_modified_at: '',
      indexed_at: '', thumb_hash: null,
    }
    galleryStore.images.unshift(img)
    galleryStore.clearSelection()
    modalIndex.value = 0
    modalMeta.value = res.data
    if (res.data.thumbBase64) {
      thumbCache.set(-1, `data:image/jpeg;base64,${res.data.thumbBase64}`)
    }
    modalOpen.value = true
    loadFullImage(img)
    appStore.setStatus('识别完成')
  } else {
    appStore.setStatus(res.error || '无法读取元数据')
  }
}

const thumbCache = new Map<number, string>()
let observer: IntersectionObserver | null = null
const scrollContainer = ref<HTMLElement | null>(null)
const modalImage = ref<HTMLImageElement | null>(null)

// ── Modal state ──
const modalOpen = ref(false)
const modalIndex = ref(0)
const modalMeta = ref<SDMetadata | null>(null)
const metaLoading = ref(false)

const modalImageData = computed(() => {
  if (modalIndex.value < 0 || modalIndex.value >= galleryStore.images.length) return null
  return galleryStore.images[modalIndex.value]
})

const modalImageId = computed(() => modalImageData.value?.id ?? 0)
const modalTags = computed(() => galleryStore.imageTags.get(modalImageId.value) || [])
const modalThumbSrc = computed(() => thumbCache.get(modalImageId.value) || '')
const modalFullSrc = ref('')

async function loadFullImage(img: GalleryImage) {
  modalFullSrc.value = ''
  try {
    const res = await window.fsAPI.readImageBase64(img.path)
    if (res.success && res.base64 && res.mime) {
      modalFullSrc.value = `data:${res.mime};base64,${res.base64}`
    }
  } catch (_) {
    // fall back to thumbnail
  }
}

function openModal(index: number) {
  modalIndex.value = index
  modalOpen.value = true
  modalMeta.value = null
  metaLoading.value = true
  const img = galleryStore.images[index]
  if (img) {
    galleryStore.selectImage(img)
    loadFullImage(img)
    if (!galleryStore.imageTags.has(img.id)) galleryStore.fetchTags(img.id)
    // Fetch SD metadata
    if (window.galleryAPI) {
      window.galleryAPI.getMetadata(img.id).then((res) => {
        if (res.success && res.data) {
          modalMeta.value = res.data
        }
        metaLoading.value = false
      })
    } else {
      metaLoading.value = false
    }
  }
}

function closeModal() {
  modalOpen.value = false
}

function modalPrev() {
  if (modalIndex.value > 0) {
    openModal(modalIndex.value - 1)
  }
}

function modalNext() {
  if (modalIndex.value < galleryStore.images.length - 1) {
    openModal(modalIndex.value + 1)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!modalOpen.value) return
  if (e.key === 'Escape') { closeModal(); return }
  if (e.key === 'ArrowLeft') { modalPrev(); return }
  if (e.key === 'ArrowRight') { modalNext(); return }
}

onMounted(() => {
  galleryStore.setupScanListener()
  galleryStore.loadRoots()
  // Don't auto-load — wait for user to pick a folder
  window.addEventListener('keydown', handleKeydown)

  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement
        const imageId = Number(el.dataset.imageId)
        if (imageId && !el.getAttribute('src')) {
          loadThumb(imageId, el as HTMLImageElement)
          loadTags(imageId)
        }
      }
    }
  }, { rootMargin: '300px' })

  requestAnimationFrame(() => observeCards())
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  window.removeEventListener('keydown', handleKeydown)
})

// Re-observe cards whenever images change (async load complete)
watch(() => galleryStore.images.length, () => {
  watchNewCards()
})

function observeCards() {
  document.querySelectorAll('.card-thumb img[data-image-id]').forEach((el) => {
    observer?.observe(el)
  })
  document.querySelectorAll('.card-thumb img[data-image-id][src]').forEach((el) => {
    const id = Number((el as HTMLElement).dataset.imageId)
    if (id && !galleryStore.imageTags.has(id)) loadTags(id)
  })
}

async function loadThumb(imageId: number, imgEl: HTMLImageElement) {
  if (thumbCache.has(imageId)) { imgEl.src = thumbCache.get(imageId)!; return }
  if (!window.galleryAPI) return
  const res = await window.galleryAPI.getThumbnail(imageId)
  if (res.success && res.data) {
    const src = `data:image/jpeg;base64,${res.data.base64}`
    thumbCache.set(imageId, src)
    imgEl.src = src
  }
}

async function loadTags(imageId: number) {
  if (galleryStore.imageTags.has(imageId)) return
  await galleryStore.fetchTags(imageId)
}

function watchNewCards() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.card-thumb img[data-image-id]:not([src])').forEach((el) => observer?.observe(el))
    observeCards()
  })
}

// ── Card click: multi-select or open modal ──
function handleCardClick(image: GalleryImage, index: number, event: MouseEvent) {
  if (event.ctrlKey || event.metaKey) {
    galleryStore.toggleSelect(image.id, true)
  } else {
    galleryStore.toggleSelect(image.id, false)
    openModal(index)
  }
}

// ── Actions ──
function handleOpenFolder() {
  const img = modalImageData.value
  if (!img || !window.shellAPI) return
  window.shellAPI.openFolder(img.path)
}

function handleCopyPath() {
  const img = modalImageData.value
  if (!img) return
  navigator.clipboard.writeText(img.path).then(() => {
    appStore.setStatus('已复制路径')
  })
}
function copySeed() {
  if (modalMeta.value?.seed !== undefined) {
    navigator.clipboard.writeText(String(modalMeta.value.seed)).then(() => appStore.setStatus('Seed 已复制'))
  }
}
function copyPrompt() {
  if (modalMeta.value?.prompt) {
    navigator.clipboard.writeText(modalMeta.value.prompt).then(() => appStore.setStatus('Prompt 已复制'))
  }
}
function copyNegative() {
  if (modalMeta.value?.negative) {
    navigator.clipboard.writeText(modalMeta.value.negative).then(() => appStore.setStatus('Negative 已复制'))
  }
}

function handleSendToTaggerSingle() {
  galleryStore.selectedIds.value = new Set([modalImageId.value])
  galleryStore.sendToTagger()
  router.push('/tagger')
}

async function handleAddRoot() {
  if (!window.fsAPI) return
  const folderPath = await window.fsAPI.selectFolder()
  if (!folderPath) return
  await galleryStore.addRoot(folderPath)
  watchNewCards()
}

async function handleScan() {
  await galleryStore.scanRoot()
  watchNewCards()
}

function handleSendToTaggerBatch() {
  galleryStore.sendToTagger()
  router.push('/tagger')
}

async function handleRootClick(root: LibraryRoot) {
  galleryStore.setActiveRoot(root.id)
  watchNewCards()
}

async function handleRemoveRoot(root: LibraryRoot) {
  if (!confirm(`确定要移除图库 "${root.label}" 吗？图片文件不会被删除。`)) return
  await galleryStore.removeRoot(root.id, false)
}

function handleScroll() {
  const el = scrollContainer.value
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
    galleryStore.loadMore()
    watchNewCards()
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour12: false })
  } catch { return iso }
}
</script>

<template>
  <div class="gallery-page" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <!-- Drag overlay -->
    <div v-if="isDragOver" class="drag-overlay">
      <div class="drag-hint">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        <span>拖入图片即可识别元数据</span>
      </div>
    </div>

    <!-- Header -->
    <div class="page-header">
      <h1 class="page-title">图库</h1>
      <p class="page-desc">管理本地动漫图片库，快速浏览与检索 · 拖入图片即时识别</p>
    </div>

    <!-- Toolbar -->
    <div class="gallery-toolbar">
      <button class="btn btn-primary" @click="handleAddRoot">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        添加文件夹
      </button>
      <button
        class="btn btn-secondary"
        :disabled="galleryStore.roots.length === 0 || galleryStore.isScanning"
        @click="handleScan"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
        {{ galleryStore.isScanning ? '扫描中...' : '扫描全部' }}
      </button>

      <!-- Active selection actions -->
      <div v-if="galleryStore.selectedCount > 0" class="selection-actions">
        <span class="selection-count">{{ galleryStore.selectedCount }} 张已选</span>
        <button class="btn btn-primary" style="background: var(--gradient-hero);" @click="handleSendToTaggerBatch">
          🏷 标注选中
        </button>
        <button class="btn btn-ghost" @click="galleryStore.clearSelection()">取消选择</button>
      </div>

      <!-- Scan progress -->
      <div v-if="galleryStore.isScanning && galleryStore.scanProgress" class="scan-info">
        <div class="mini-progress">
          <div
            class="mini-progress-fill"
            :style="{ width: galleryStore.scanProgress.total > 0 ? (galleryStore.scanProgress.current / galleryStore.scanProgress.total * 100) + '%' : '0%' }"
          ></div>
        </div>
        <span class="scan-status-text">{{ galleryStore.scanProgress.status }}</span>
      </div>

      <span class="gallery-count">共 {{ galleryStore.images.length }} 张</span>
    </div>

    <!-- Body -->
    <div class="gallery-body">
      <!-- Sidebar -->
      <aside class="gallery-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-label">图库目录</span>
        </div>

        <div v-if="galleryStore.roots.length === 0" class="sidebar-empty">
          <p>暂无目录</p>
          <p>点击上方按钮添加</p>
        </div>

        <div class="root-list">
          <button
            class="root-item"
            :class="{ active: galleryStore.activeRootId === null }"
            @click="galleryStore.setActiveRoot(null); watchNewCards()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span>全部图片</span>
          </button>
          <button
            v-for="root in galleryStore.roots"
            :key="root.id"
            class="root-item"
            :class="{ active: galleryStore.activeRootId === root.id }"
            @click="handleRootClick(root)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            <span class="root-name">{{ root.label }}</span>
            <span class="root-count">{{ root.image_count ?? 0 }}</span>
          </button>
        </div>
      </aside>

      <!-- Main Grid -->
      <main ref="scrollContainer" class="gallery-main" @scroll="handleScroll">
        <!-- Empty state -->
        <div v-if="!galleryStore.isScanning && galleryStore.images.length === 0" class="hero-empty">
          <div class="hero-glow"></div>
          <div class="hero-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8">
              <rect x="2" y="2" width="20" height="20" rx="4"/>
              <circle cx="8.5" cy="8.5" r="2"/>
              <path d="M22 16l-6-6-4 4-4-4L2 16"/>
              <circle cx="16" cy="7" r="1" fill="currentColor" stroke="none"/>
            </svg>
          </div>
          <h2>在左侧选择一个文件夹</h2>
          <p>加载本地图片 · 浏览元数据 · 一键标注</p>
          <button class="btn btn-primary hero-btn" @click="handleAddRoot">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            添加文件夹
          </button>
        </div>

        <!-- Grid -->
        <div class="gallery-grid">
          <div
            v-for="(image, index) in galleryStore.images"
            :key="image.id"
            class="gallery-card"
            :class="{ selected: galleryStore.isSelected(image.id) }"
            @click="handleCardClick(image, index, $event)"
          >
            <div class="card-thumb">
              <img :data-image-id="image.id" alt="" />
              <!-- Tag badges -->
              <div v-if="galleryStore.imageTags.has(image.id) && galleryStore.imageTags.get(image.id)!.length > 0" class="card-tags">
                <span v-for="(tag, i) in galleryStore.imageTags.get(image.id)!.slice(0, 3)" :key="i" class="card-tag-pill">{{ tag.tag }}</span>
                <span v-if="galleryStore.imageTags.get(image.id)!.length > 3" class="card-tag-more">+{{ galleryStore.imageTags.get(image.id)!.length - 3 }}</span>
              </div>
              <!-- Select check -->
              <div v-if="galleryStore.isSelected(image.id)" class="card-select-badge">✓</div>
              <!-- Hover overlay -->
              <div class="card-overlay">
                <span class="card-dims">{{ image.width }} × {{ image.height }}</span>
              </div>
            </div>
            <div class="card-name">{{ image.filename }}</div>
          </div>
        </div>

        <div v-if="galleryStore.isLoading" class="load-more">加载中...</div>
      </main>
    </div>

    <!-- ══════ IMAGE DETAIL MODAL ══════ -->
    <Teleport to="body">
      <div v-if="modalOpen && modalImageData" class="modern-modal-overlay" @click.self="closeModal">
        <div class="modern-modal-container">

          <!-- 左侧：图片预览区 -->
          <div class="modern-preview-zone">
            <button class="m-nav-btn prev" @click="modalPrev" :disabled="modalIndex === 0">
              <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>

            <div class="modern-image-wrapper">
              <img v-if="modalFullSrc || modalThumbSrc" :src="modalFullSrc || modalThumbSrc" alt="Preview" class="modern-main-image" />
            </div>

            <button class="m-nav-btn next" @click="modalNext" :disabled="modalIndex === galleryStore.images.length - 1">
              <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
          </div>

          <!-- 右侧：信息侧边栏 -->
          <div class="modern-sidebar">
            <div class="m-sidebar-header">
              <div class="title-area">
                <h3 :title="modalImageData.filename">{{ modalImageData.filename }}</h3>
                <div class="sub-dimens">
                  <span>{{ modalImageData.width }} × {{ modalImageData.height }}</span>
                  <span class="dot">·</span>
                  <span>{{ formatSize(modalImageData.file_size) }}</span>
                </div>
              </div>
              <button class="m-close-btn" @click="closeModal">✕</button>
            </div>

            <div class="m-sidebar-content">

              <!-- Params Dashboard -->
              <div class="params-dashboard">
                <div class="param-card">
                  <span class="p-label">STEPS</span>
                  <span class="p-val">{{ modalMeta?.steps || '-' }}</span>
                </div>
                <div class="param-card">
                  <span class="p-label">CFG</span>
                  <span class="p-val highlight">{{ modalMeta?.cfg || '-' }}</span>
                </div>
                <div class="param-card full-width">
                  <span class="p-label">SAMPLER</span>
                  <span class="p-val truncate" :title="modalMeta?.sampler">{{ modalMeta?.sampler || '-' }}</span>
                </div>
                <div class="param-card full-width clickable" @click="copySeed()">
                  <span class="p-label">SEED 📋</span>
                  <span class="p-val code-font">{{ modalMeta?.seed || '-' }}</span>
                </div>
              </div>

              <!-- Model badge -->
              <div v-if="modalMeta?.model" class="model-badge">
                <span class="b-tag">{{ modalMeta?.generator || 'MODEL' }}</span>
                <span class="b-name" :title="modalMeta.model">{{ modalMeta.model }}</span>
              </div>

              <!-- PROMPT -->
              <div class="prompt-box block-positive">
                <div class="p-box-header">
                  <span>PROMPT</span>
                  <button class="copy-inside-btn" @click="copyPrompt()">复制</button>
                </div>
                <div class="p-box-text">{{ modalMeta?.prompt || '无提示词数据' }}</div>
              </div>

              <!-- NEGATIVE -->
              <div class="prompt-box block-negative">
                <div class="p-box-header">
                  <span>NEGATIVE PROMPT</span>
                  <button class="copy-inside-btn" @click="copyNegative()">复制</button>
                </div>
                <div class="p-box-text">{{ modalMeta?.negative || '无反向提示词数据' }}</div>
              </div>

              <!-- LoRA -->
              <div v-if="modalMeta?.loras && modalMeta.loras.length" class="lora-section">
                <div class="section-sm-title">⚡ LORA ATTACHED</div>
                <div class="lora-chips">
                  <div v-for="(lora, idx) in modalMeta.loras" :key="idx" class="lora-chip">
                    <span class="lc-name">{{ lora.name }}</span>
                    <span class="lc-weight">{{ lora.weight }}</span>
                  </div>
                </div>
              </div>

              <!-- 无元数据 -->
              <div v-if="!metaLoading && !modalMeta?.hasMetadata" class="prompt-box" style="text-align:center;">
                <div class="p-box-text" style="color:#666;">不含 SD 元数据</div>
              </div>

              <!-- File details -->
              <div class="file-footer-details">
                <div class="f-row"><span class="f-lbl">修改时间</span><span class="f-val">{{ formatDate(modalImageData.file_modified_at) }}</span></div>
                <div class="f-row file-path"><span class="f-lbl">路径</span><span class="f-val" :title="modalImageData.path">{{ modalImageData.path }}</span></div>
              </div>

            </div>

            <!-- Footer -->
            <div class="m-sidebar-footer">
              <button class="m-btn m-btn-primary" @click="handleSendToTaggerSingle">
                <svg viewBox="0 0 24 24" width="16" height="16" class="btn-icon"><path fill="currentColor" d="M14 4l2.29 2.29-2.88 2.88 1.42 1.42 2.88-2.88L20 10V4zm-4 16H4v-6l2.29 2.29 5.88-5.88 1.42 1.42-5.88 5.88z"/></svg>
                发送至标注器
              </button>
              <div class="m-btn-group">
                <button class="m-btn m-btn-secondary" @click="handleOpenFolder">📂 打开文件夹</button>
                <button class="m-btn m-btn-secondary" @click="handleCopyPath">📋 复制路径</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════
   GALLERY PAGE
   ═══════════════════════════════════════════ */
.gallery-page {
  max-width: 1500px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: calc(100vh - 100px);
  overflow: hidden;
  position: relative;
}

/* ── Drag overlay ── */
.drag-overlay {
  position: absolute; inset: 0; z-index: 100;
  background: rgba(244, 114, 182, 0.12);
  border: 2px dashed rgba(244, 114, 182, 0.5);
  border-radius: var(--radius-lg);
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.drag-hint {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  color: var(--accent-primary); font-size: 15px; font-weight: 600;
}

/* ── Toolbar ── */
.gallery-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  flex-shrink: 0;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}
.gallery-toolbar .btn { gap: 5px; font-size: 12px; padding: 7px 14px; }

.selection-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border-left: 1px solid var(--glass-border);
  margin-left: 4px;
}
.selection-count {
  font-size: 12px;
  color: var(--accent-primary);
  font-weight: 600;
  white-space: nowrap;
}

.scan-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 260px;
  min-width: 120px;
}
.mini-progress {
  flex: 1;
  height: 4px;
  background: var(--glass-border);
  border-radius: 2px;
  overflow: hidden;
}
.mini-progress-fill {
  height: 100%;
  background: var(--gradient-accent);
  border-radius: 2px;
  transition: width 0.3s;
}
.scan-status-text {
  font-size: 10px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.gallery-count {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: auto;
  white-space: nowrap;
}

/* ── Body ── */
.gallery-body {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Sidebar ── */
.gallery-sidebar {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sidebar-header {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--glass-border);
}
.sidebar-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sidebar-empty {
  text-align: center;
  padding: 24px 8px;
  font-size: 11px;
  color: var(--text-disabled);
}
.sidebar-empty p { margin: 2px 0; }
.root-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.root-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  width: 100%;
  text-align: left;
  font-family: var(--font-sans);
}
.root-item:hover {
  background: var(--glass-bg-hover);
  color: var(--text-primary);
}
.root-item.active {
  background: var(--accent-bg);
  color: var(--accent-primary);
  font-weight: 600;
}
.root-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.root-count {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background: rgba(255,255,255,0.05);
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* ── Main Grid ── */
.gallery-main {
  overflow-y: auto;
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding: 2px;
  align-content: start;
}

/* ── Card ── */
.gallery-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.gallery-card:hover {
  border-color: rgba(244, 114, 182, 0.4);
  transform: translateY(-3px);
  box-shadow: 0 8px 32px rgba(244, 114, 182, 0.12);
}
.gallery-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(244, 114, 182, 0.25), 0 8px 24px rgba(244, 114, 182, 0.15);
}

.card-thumb {
  aspect-ratio: 1;
  overflow: hidden;
  background: rgba(0,0,0,0.2);
  position: relative;
}
.card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s;
}
.gallery-card:hover .card-thumb img {
  transform: scale(1.05);
}

/* Tag badges on card */
.card-tags {
  position: absolute;
  bottom: 6px;
  left: 6px;
  right: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  pointer-events: none;
  z-index: 2;
}
.card-tag-pill {
  font-size: 9px;
  padding: 2px 7px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-full);
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-tag-more {
  font-size: 9px;
  padding: 2px 7px;
  background: rgba(244, 114, 182, 0.25);
  border-radius: var(--radius-full);
  color: rgba(255, 255, 255, 0.8);
}

.card-select-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  background: var(--accent-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
  font-weight: 700;
  z-index: 3;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(244, 114, 182, 0.4);
}

.card-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  background: linear-gradient(transparent, rgba(0,0,0,0.5));
  opacity: 0;
  transition: opacity 0.25s;
  z-index: 1;
}
.gallery-card:hover .card-overlay { opacity: 1; }
.card-dims {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  font-family: var(--font-mono);
}

.card-name {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.load-more {
  text-align: center;
  padding: 24px;
  color: var(--text-tertiary);
  font-size: 12px;
}

/* ── Hero Empty ── */
.hero-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  position: relative;
  overflow: hidden;
}
.hero-glow {
  position: absolute;
  width: 360px; height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,105,180,0.08) 0%, transparent 70%);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.hero-empty-icon {
  width: 100px;
  height: 100px;
  color: #ff69b4;
  opacity: 0.5;
  margin-bottom: 20px;
  position: relative;
  z-index: 1;
  animation: heroFloat 3s ease-in-out infinite;
}
.hero-empty-icon svg { width: 100%; height: 100%; }
@keyframes heroFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
.hero-empty h2 {
  font-size: 22px;
  background: linear-gradient(135deg, #ff69b4 0%, #ff85c2 40%, #f9a8d4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 700;
  margin: 0 0 10px;
  position: relative;
  z-index: 1;
  letter-spacing: 0.02em;
}
.hero-empty p {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 28px;
  position: relative;
  z-index: 1;
  letter-spacing: 0.04em;
}
.hero-btn {
  position: relative;
  z-index: 1;
  padding: 12px 28px;
  font-size: 14px;
  gap: 8px;
}

/* ═══════════════════════════════════════════
   IMAGE DETAIL MODAL (v4)
   ═══════════════════════════════════════════ */
.modern-modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background-color: rgba(10, 10, 11, 0.92); backdrop-filter: blur(8px);
  display: flex; justify-content: center; align-items: center;
  z-index: 1000; padding: 16px; box-sizing: border-box;
}
.modern-modal-container {
  display: flex; width: 100%; max-width: 1600px; height: 100%; max-height: calc(100vh - 32px);
  background-color: #1a1a1c; border-radius: 20px; overflow: hidden;
  box-shadow: 0 32px 64px rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

/* ── Preview zone ── */
.modern-preview-zone {
  flex: 1; height: 100%; position: relative; background-color: #111112; overflow: hidden;
}
.modern-image-wrapper {
  position: absolute; top: 8px; left: 8px; right: 8px; bottom: 8px;
  display: flex; justify-content: center; align-items: center;
}
.modern-main-image { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,0.75); }

.m-nav-btn {
  position: absolute; width: 40px; height: 40px; border-radius: 50%; border: none;
  background-color: rgba(30, 30, 32, 0.6); color: #9ca3af; cursor: pointer;
  display: flex; justify-content: center; align-items: center; z-index: 5;
}
.m-nav-btn:hover:not(:disabled) { background-color: #ff69b4; color: #fff; }
.m-nav-btn:disabled { opacity: 0.1; cursor: not-allowed; }
.prev { left: 16px; top: 50%; transform: translateY(-50%); }
.next { right: 16px; top: 50%; transform: translateY(-50%); }

/* ── Sidebar ── */
.modern-sidebar {
  width: 360px; flex-shrink: 0; height: 100%; background-color: #18181a;
  border-left: 1px solid rgba(255,255,255,0.04); display: flex; flex-direction: column;
}
.m-sidebar-header { padding: 20px 24px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.03); }
.title-area { flex: 1; min-width: 0; }
.title-area h3 { font-size: 15px; font-weight: 600; color: #f3f4f6; margin: 0 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 290px; }
.sub-dimens { display: flex; gap: 8px; font-size: 11px; color: #6b7280; font-family: monospace; }
.m-close-btn { background: none; border: none; color: #4b5563; font-size: 16px; cursor: pointer; }
.m-close-btn:hover { color: #ff69b4; }

.m-sidebar-content { flex: 1; overflow-y: auto; padding: 0 24px 20px; }
.m-sidebar-content::-webkit-scrollbar { width: 4px; }
.m-sidebar-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

/* ── Params dashboard ── */
.params-dashboard { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 18px; }
.param-card { background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.03); padding: 10px 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px; }
.param-card.full-width { grid-column: span 2; }
.param-card.clickable { cursor: pointer; }
.param-card.clickable:hover { background-color: rgba(255,255,255,0.05); }
.p-label { font-size: 9px; font-weight: bold; color: #6b7280; letter-spacing: 0.5px; }
.p-val { font-size: 13px; color: #e5e7eb; font-weight: 600; }
.p-val.highlight { color: #ff69b4; }
.p-val.code-font { font-family: monospace; font-size: 12px; color: #9ca3af; }

/* ── Model badge ── */
.model-badge { display: flex; align-items: center; background-color: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); font-size: 11px; border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
.b-tag { background: #ff69b4; color: #fff; padding: 4px 8px; font-weight: bold; font-size: 9px; }
.b-name { color: #d1d5db; padding-left: 8px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Prompt boxes ── */
.prompt-box { background-color: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.02); border-radius: 8px; padding: 12px; margin-bottom: 14px; }
.p-box-header { display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; color: #ff69b4; margin-bottom: 6px; }
.block-negative .p-box-header { color: #ef4444; }
.p-box-text { font-size: 12px; line-height: 1.5; color: #9ca3af; max-height: 100px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; user-select: text; }
.copy-inside-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #d1d5db; cursor: pointer; font-size: 10px; padding: 4px 10px; border-radius: 5px; display: flex; align-items: center; gap: 4px; transition: all 0.2s; }
.copy-inside-btn::before { content: '📋'; font-size: 10px; }
.copy-inside-btn:hover { background: rgba(255,105,180,0.15); border-color: rgba(255,105,180,0.3); color: #ff69b4; }

/* ── LoRA chips ── */
.section-sm-title { font-size: 10px; font-weight: bold; color: #4b5563; margin-bottom: 8px; }
.lora-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
.lora-chip { display: flex; background: rgba(255,105,180,0.06); border: 1px solid rgba(255,105,180,0.15); font-size: 11px; border-radius: 4px; padding: 2px 6px; }
.lc-name { color: #ff69b4; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lc-weight { color: #9ca3af; font-weight: bold; margin-left: 4px; }

/* ── File details footer ── */
.file-footer-details { border-top: 1px dashed rgba(255,255,255,0.04); padding-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.f-row { display: flex; justify-content: space-between; font-size: 11px; color: #4b5563; }
.file-path { flex-direction: column; gap: 2px; }
.file-path .f-val { word-break: break-all; line-height: 1.3; color: #374151; font-family: monospace; }

/* ── Footer buttons ── */
.m-sidebar-footer { padding: 20px 24px; display: flex; flex-direction: column; gap: 8px; background-color: #161618; border-top: 1px solid rgba(255,255,255,0.03); }
.m-btn { border: none; padding: 10px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 6px; }
.m-btn-primary { background-color: #ff69b4; color: #fff; font-weight: bold; width: 100%; }
.m-btn-primary:hover { background-color: #ff85c2; }
.m-btn-group { display: flex; gap: 8px; width: 100%; }
.m-btn-secondary { flex: 1; background-color: rgba(255,255,255,0.03); color: #9ca3af; border: 1px solid rgba(255,255,255,0.02); }
.m-btn-secondary:hover { background-color: rgba(255,255,255,0.06); color: #fff; }
</style>

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const rule = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('gallery workspace UI', () => {
  it('uses focused gallery components instead of the mixed tagger page', () => {
    const gallery = read('src/views/Gallery.vue')

    expect(gallery).toContain("import GallerySidebar from '@/components/tagger/GallerySidebar.vue'")
    expect(gallery).toContain("import GalleryToolbar from '@/components/tagger/GalleryToolbar.vue'")
    expect(gallery).toContain("import GalleryGrid from '@/components/tagger/GalleryGrid.vue'")
    expect(gallery).toContain("import GalleryInspector from '@/components/tagger/GalleryInspector.vue'")
    expect(gallery).toContain("import GallerySelectionBar from '@/components/tagger/GallerySelectionBar.vue'")
    expect(gallery).not.toContain('TagSettingsPanel')
  })

  it('shows detail for one image and the batch bar for multiple images', () => {
    const gallery = read('src/views/Gallery.vue')

    expect(gallery).toContain('v-if="galleryStore.selectedCount === 1"')
    expect(gallery).toContain('v-if="galleryStore.selectedCount > 1"')
  })

  it('creates the annotation handoff before navigating', () => {
    const gallery = read('src/views/Gallery.vue')

    expect(gallery).toContain('createGalleryHandoff(')
    expect(gallery).toContain('taggerStore.createQueueFromGallery(handoff)')
    expect(gallery).toContain("router.push('/tagger')")
  })

  it('keeps click, toggle, range, and metadata-open as separate grid events', () => {
    const grid = read('src/components/tagger/GalleryGrid.vue')

    expect(grid).toContain('select: [image: ImageCard]')
    expect(grid).toContain('toggle: [image: ImageCard]')
    expect(grid).toContain('rangeSelect: [image: ImageCard]')
    expect(grid).toContain('openMetadata: [image: ImageCard, index: number]')
  })

  it('keeps renderer, database, and annotation queue paths aligned after a move', () => {
    const gallery = read('src/views/Gallery.vue')

    expect(gallery).toContain('window.fsAPI.moveImages(')
    expect(gallery).toContain('window.galleryAPI.updateImagePaths(mappings)')
    expect(gallery).toContain('galleryStore.replaceImagePaths(mappings)')
    expect(gallery).toContain('taggerStore.replacePaths(mappings)')
  })

  it('indexes dataset folders before sending them to annotation', () => {
    const gallery = read('src/views/Gallery.vue')

    expect(gallery).toContain('async function ensureDatasetIndexed')
    expect(gallery).toContain('await ensureDatasetIndexed(activeDataset.value.folderPath)')
    expect(gallery).not.toContain('indexed?.id ?? 0')
  })

  it('uses one compact toolbar and keeps the mascot out of gallery', () => {
    const gallery = read('src/views/Gallery.vue')
    const toolbar = read('src/components/tagger/GalleryToolbar.vue')
    const grid = read('src/components/tagger/GalleryGrid.vue')

    expect(gallery).not.toContain('class="gallery-header"')
    expect(gallery).not.toContain("import Mascot")
    expect(grid).not.toContain("import Mascot")
    expect(grid).not.toContain('<Mascot')
    expect(toolbar).toContain('title: string')
    expect(toolbar).toContain('scanning: boolean')
    expect(toolbar).toContain('scan: []')
    expect(toolbar).toContain('addRoot: []')
    expect(toolbar).toContain('importImages: []')
  })

  it('restores a dataset view instead of replacing it with all images on mount', () => {
    const gallery = read('src/views/Gallery.vue')

    expect(gallery).toContain('if (galleryStore.activeDatasetId)')
    expect(gallery).toContain('galleryStore.loadDatasetImages(galleryStore.activeDatasetId)')
  })

  it('supports drag-to-read and batch import without changing the compact shell', () => {
    const gallery = read('src/views/Gallery.vue')
    const preload = read('electron/preload.js')

    expect(gallery).toContain('@dragenter.prevent="onDragEnter"')
    expect(gallery).toContain('@drop.prevent="onDrop"')
    expect(gallery).toContain('class="gallery-drag-overlay"')
    expect(gallery).toContain('window.galleryAPI.inspectDroppedPaths(paths)')
    expect(gallery).toContain('window.galleryAPI.importFiles(classified.imagePaths)')
    expect(preload).toContain("ipcRenderer.invoke('gallery:inspectDroppedPaths', paths)")
    expect(preload).toContain("ipcRenderer.invoke('gallery:importFiles', paths)")
  })

  it('hands the active dataset and caption health to the complete trainer', () => {
    const gallery = read('src/views/Gallery.vue')

    expect(gallery).toContain('baka-training-dataset-handoff')
    expect(gallery).toContain('missingCaptionCount')
    expect(gallery).toContain('invalidCount')
    expect(gallery).toContain("localStorage.setItem('baka-training-mode', 'advanced')")
    expect(gallery).toContain("router.push('/training')")
  })

  it('blends gallery sources, toolbar, stage, and inspector into one window canvas', () => {
    const gallery = read('src/views/Gallery.vue')
    const sidebar = read('src/components/tagger/GallerySidebar.vue')
    const toolbar = read('src/components/tagger/GalleryToolbar.vue')
    const inspector = read('src/components/tagger/GalleryInspector.vue')

    expect(gallery).toContain('class="gallery-workspace"')
    expect(gallery).not.toContain('class="gallery-shell"')
    expect(rule(gallery, '.gallery-workspace')).toContain('border: 0')
    expect(rule(gallery, '.gallery-workspace')).toContain('background: transparent')
    expect(rule(gallery, '.gallery-workspace')).toContain('box-shadow: none')
    expect(rule(gallery, '.gallery-workspace')).toContain('gap: 14px')
    expect(rule(sidebar, '.gallery-sidebar')).toContain('border: 0')
    expect(rule(toolbar, '.gallery-toolbar')).toContain('border: 0')
    expect(rule(inspector, '.gallery-inspector')).toContain('border: 0')
    expect(rule(gallery, '.dataset-toolbar')).toContain('border: 0')
  })

  it('keeps the gallery fluid and quiet when motion is reduced', () => {
    const gallery = read('src/views/Gallery.vue')
    const grid = read('src/components/tagger/GalleryGrid.vue')

    expect(gallery).toMatch(/@media \(max-width: 980px\)[\s\S]*?\.gallery-stage :deep\(\.gallery-inspector\)/)
    expect(gallery).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.gallery-page[^}]*overflow-x: hidden/)
    expect(grid).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.image-card[^}]*transition: none/)
  })

  it('uses one import menu for images and folders without duplicate sidebar actions', () => {
    const toolbar = read('src/components/tagger/GalleryToolbar.vue')
    const sidebar = read('src/components/tagger/GallerySidebar.vue')
    const gallery = read('src/views/Gallery.vue')

    expect(toolbar).toContain('<button class="toolbar-action toolbar-action--primary" aria-label="导入"')
    expect(toolbar).toContain('<span class="toolbar-action__icon" aria-hidden="true">＋</span>')
    expect(toolbar).toContain('<span class="toolbar-action__label">导入</span>')
    expect(toolbar).toContain("emit('importImages')")
    expect(toolbar).toContain("emit('addRoot')")
    expect(sidebar).not.toContain('addRoot: []')
    expect(sidebar).not.toContain('class="sidebar-import"')
    expect(gallery).toContain('window.fsAPI.selectImages()')
    expect(gallery).toContain('window.galleryAPI.importFiles(filePaths)')
    expect(gallery).toContain('@import-images="importImages"')
    expect(toolbar).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.toolbar-action__label\s*\{\s*display: none/)
    expect(toolbar).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.toolbar-action__icon\s*\{\s*font-size: 12px/)
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

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
  })

  it('restores a dataset view instead of replacing it with all images on mount', () => {
    const gallery = read('src/views/Gallery.vue')

    expect(gallery).toContain('if (galleryStore.activeDatasetId)')
    expect(gallery).toContain('galleryStore.loadDatasetImages(galleryStore.activeDatasetId)')
  })
})

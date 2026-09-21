import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('immersive metadata viewer', () => {
  const sourcePath = resolve(process.cwd(), 'src/components/tagger/MetadataViewer.vue')

  it('uses four focused tabs and keeps the image as the main visual', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain("type ViewerTab = 'overview' | 'generation' | 'raw' | 'tags'")
    expect(source).toContain('详情')
    expect(source).toContain('生成参数')
    expect(source).toContain('原始元数据')
    expect(source).toContain('标签')
    expect(source).toContain('metadata-viewer__image-stage')
  })

  it('fits the whole image by default and only uses 1:1 when viewing the original', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain("zoomMode = ref<'fit' | 'original'>('fit')")
    expect(source).toContain("zoomMode === 'fit' ? '查看原图' : '适合窗口'")
    expect(source).toContain('is-fit')
    expect(source).toContain('is-original')
    expect(source).toMatch(/img\.zoom-fit[\s\S]*object-fit:\s*contain/)
    expect(source).toMatch(/is-fit[\s\S]*overflow:\s*hidden/)
    expect(source).toMatch(/img\.zoom-original[\s\S]*max-width:\s*none/)
  })

  it('supports previous, next, close, and fit/original keyboard behavior', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain("event.key === 'ArrowLeft'")
    expect(source).toContain("event.key === 'ArrowRight'")
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('toggleZoom')
  })

  it('renders only normalized non-empty metadata fields', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('buildMetadataSections')
    expect(source).toContain('v-for="field in sections.overview"')
    expect(source).toContain('v-for="field in sections.generation"')
  })

  it('breaks the two-column grid with polaroids, stickers, and a floating chrome', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('viewer-peek')
    expect(source).toContain('viewer-shot')
    expect(source).toContain('viewer-sticker')
    expect(source).toContain('viewer-ambient__dots')
    expect(source).toContain('getThumbnailUrl')
    expect(source).toContain('rotate(-2.4deg)')
    expect(source).toContain('rotate(1.6deg)')
    expect(source).toContain('rotate(-10deg)')
    expect(source).not.toContain('grid-template-columns: minmax(0, 1fr) minmax(340px, 400px)')
  })

  it('uses living-pink chrome instead of the old cinema shell', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('var(--app-bg)')
    expect(source).toContain('var(--surface-primary)')
    expect(source).toContain('var(--brand-gradient)')
    expect(source).toContain('var(--radius-hero)')
    expect(source).toContain('btn btn-secondary')
    expect(source).toContain('btn btn-primary')
    expect(source).not.toContain('#111015')
    expect(source).not.toContain('#18161c')
    expect(source).not.toContain('#0d0c10')
  })

  it('keeps a dropped temporary image read-only', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const gallery = readFileSync(resolve(process.cwd(), 'src/views/Gallery.vue'), 'utf8')

    expect(source).toContain('readOnly?: boolean')
    expect(source).toContain('v-if="!readOnly" class="btn btn-primary"')
    expect(source).toContain('class="viewer-temporary"')
    expect(gallery).toContain(':read-only="isTemporaryViewer"')
    expect(gallery).toContain('if (metadataIndex.value === null || isTemporaryViewer.value) return')
  })
})

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

  it('keeps a dropped temporary image read-only', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const gallery = readFileSync(resolve(process.cwd(), 'src/views/Gallery.vue'), 'utf8')

    expect(source).toContain('readOnly?: boolean')
    expect(source).toContain('v-if="!readOnly" class="primary"')
    expect(source).toContain('class="viewer-temporary"')
    expect(gallery).toContain(':read-only="isTemporaryViewer"')
    expect(gallery).toContain('if (metadataIndex.value === null || isTemporaryViewer.value) return')
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const dashboard = read('src/views/Dashboard.vue')
const gallery = read('src/views/Gallery.vue')
const tagger = read('src/views/Tagger.vue')
const layout = read('src/layouts/MainLayout.vue')

describe('application shell', () => {
  it('uses the character-led dashboard instead of a tutorial workflow', () => {
    expect(dashboard).toContain("import HeroCard from '@/components/dashboard/HeroCard.vue'")
    expect(dashboard).toContain("import PolaroidFan, { type PolaroidItem } from '@/components/dashboard/PolaroidFan.vue'")
    expect(dashboard).not.toContain('workflow-grid')
    expect(dashboard).not.toContain('cabin-label')
  })

  it('uses separate gallery and annotation workspaces', () => {
    expect(gallery).toContain('GalleryInspector')
    expect(gallery).toContain('GallerySelectionBar')
    expect(gallery).toContain('MetadataViewer')
    expect(tagger).toContain('TagQueue')
    expect(tagger).toContain('TagEditor')
    expect(tagger).toContain('TagRunProgress')
  })

  it('retires the old mixed page, overlay components, and the node canvas', () => {
    for (const retired of [
      'src/views/TaggerV2.vue',
      'src/stores/taggerV2.ts',
      'src/components/tagger/TagProgressOverlay.vue',
      'src/components/tagger/TagImageModal.vue',
      'src/views/Workbench.vue',
      'src/stores/workbench.ts',
      'src/components/workbench',
      'src/features/workbench',
    ]) {
      expect(existsSync(resolve(process.cwd(), retired)), retired).toBe(false)
    }
    expect(read('src/components/sidebar/AppSidebar.vue')).not.toContain('useWorkbenchStore')
  })

  it('provides a reduced-motion fallback for ambient effects', () => {
    expect(layout).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

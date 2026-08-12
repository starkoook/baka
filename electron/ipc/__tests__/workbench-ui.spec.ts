import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const dashboard = read('src/views/Dashboard.vue')
const gallery = read('src/views/Gallery.vue')
const tagger = read('src/views/Tagger.vue')
const layout = read('src/layouts/MainLayout.vue')

describe('stable workbench UI', () => {
  it('uses the approved character-led dashboard instead of a tutorial workflow', () => {
    expect(dashboard).toContain("import BrandHero from '@/components/dashboard/BrandHero.vue'")
    expect(dashboard).toContain("import DashboardRecentWork from '@/components/dashboard/DashboardRecentWork.vue'")
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

  it('retires the old mixed page and overlay components', () => {
    expect(existsSync(resolve(process.cwd(), 'src/views/TaggerV2.vue'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'src/stores/taggerV2.ts'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'src/components/tagger/TagProgressOverlay.vue'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'src/components/tagger/TagImageModal.vue'))).toBe(false)
  })

  it('provides a reduced-motion fallback for ambient effects', () => {
    expect(layout).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('infinite canvas workbench', () => {
  const workbench = read('src/views/Workbench.vue')

  it('keeps node types open instead of hardcoding image/video/text', () => {
    expect(workbench).toContain('BUILTIN_NODES')
    expect(workbench).toContain("def.kind ?? 'generic'")
    expect(workbench).toContain('wb-node__generic')
  })

  it('provides standard infinite canvas interactions', () => {
    expect(workbench).toContain('workbench__box')
    expect(workbench).toContain('selectedNodeIds')
    expect(workbench).toContain('workbench__minimap')
    expect(workbench).toContain('snapGrid')
    expect(workbench).toContain('undoStack')
    expect(workbench).toContain('clipboard')
    expect(workbench).toContain('duplicateSelected')
  })

  it('auto-saves with debounce and restores on mount', () => {
    expect(workbench).toContain('function scheduleAutosave')
    expect(workbench).toContain('1500')
    expect(workbench).toContain('workflowAPI?.saveAutosave')
    expect(workbench).toContain('restoreAutosave')
    expect(workbench).toContain('已自动保存')
  })

  it('records recent projects after save/open', () => {
    expect(workbench).toContain('workflowAPI?.recordRecent')
    expect(workbench).toContain('recentProjects')
  })

  it('shows run progress and supports cancel', () => {
    expect(workbench).toContain('runProgress')
    expect(workbench).toContain('cancelRequested')
    expect(workbench).toContain('function cancelRun')
  })

  it('provides a comfyui-style left rail with panels and animations', () => {
    expect(workbench).toContain('wb-rail')
    expect(workbench).toContain('railTab')
    expect(workbench).toContain('toggleRail')
    expect(workbench).toContain('wb-rail__dynamic')
    expect(workbench).toContain('wb-progress')
    expect(workbench).toContain('@keyframes wb-slide-in')
    expect(workbench).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

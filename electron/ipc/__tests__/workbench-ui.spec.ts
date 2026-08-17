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

  it('provides light-theme drawers driven by the shared workbench store', () => {
    expect(workbench).toContain('useWorkbenchStore')
    expect(workbench).toContain('wbStore.railOpen')
    expect(workbench).toContain('wb-rail__panel')
    expect(workbench).toContain('wb-run-progress')
    expect(workbench).toContain('@keyframes wb-slide-in')
    expect(workbench).toContain('@media (prefers-reduced-motion: reduce)')
    expect(workbench).not.toContain('wb-rail__dynamic')
    expect(workbench).not.toContain("railTab === 'queue'")
    expect(workbench).not.toContain("railTab === 'engine'")
  })

  it('keeps basic canvas actions in the top toolbar', () => {
    expect(workbench).toContain('workbench__toolbar')
    expect(workbench).toContain('wb-btn--run')
    expect(workbench).toContain('添加节点')
    expect(workbench).not.toContain('title="保存画布 (Ctrl+S)"')
  })

  it('collects generated results into an asset panel with drag-back', () => {
    expect(workbench).toContain('assetsAPI?.list')
    expect(workbench).toContain('collectAssetFromNode')
    expect(workbench).toContain('onAssetDragStart')
    expect(workbench).toContain('wb-assets')
  })

  it('keeps image loading separate from AI image editing', () => {
    const loadNode = read('src/components/workbench/ImageLoadNode.vue')
    const editNode = read('src/components/workbench/AiImageEditNode.vue')

    expect(workbench).toContain("{ kind: 'image', label: '加载图片'")
    expect(workbench).toContain("{ kind: 'ai-image-edit', label: 'AI 图片编辑'")
    expect(loadNode).not.toContain('API 配置')
    expect(loadNode).not.toContain('开始编辑')
    expect(editNode).toContain('开始编辑')
    expect(editNode).toContain('结果预览')
    expect(workbench).not.toContain('deriveImageNode(')
  })

  it('creates image nodes from operating-system file drops', () => {
    expect(workbench).toContain('event.dataTransfer?.files')
    expect(workbench).toContain('window.fsAPI.getFilePath')
    expect(workbench).toContain('window.workbenchImageAPI.inspect')
    expect(workbench).toContain('arrangeDroppedImages')
  })

  it('guides local engine setup and opens missing ComfyUI dependencies', () => {
    const wizard = read('src/components/workbench/LocalEngineSetup.vue')
    const notice = read('src/components/workbench/ComfyDependencyNotice.vue')
    const manager = read('src/components/workbench/ComfyDependencyManager.vue')

    expect(wizard).toContain('选择本地引擎')
    expect(wizard).toContain('ComfyUI')
    expect(wizard).toContain('WebUI / Forge')
    expect(wizard).toContain('自动检测')
    expect(wizard).toContain('选择安装目录')
    expect(notice).toContain('查看依赖')
    expect(manager).toContain('Git 拉取')
    expect(manager).toContain('安装依赖')
    expect(manager).toContain('来源未知')
    expect(manager).toContain('可能来源')
    expect(workbench).toContain('LocalEngineSetup')
    expect(workbench).toContain('ComfyDependencyNotice')
    expect(workbench).toContain('ComfyDependencyManager')
  })
})

describe('workbench dynamic left taskbar', () => {
  const sidebar = read('src/components/sidebar/AppSidebar.vue')
  const store = read('src/stores/workbench.ts')

  it('adds workbench buttons to the outermost taskbar when on the canvas', () => {
    expect(sidebar).toContain('useWorkbenchStore')
    expect(sidebar).toContain('sidebar-workbench')
    expect(sidebar).toContain("route.path === '/workbench'")
    expect(sidebar).toContain('wbStore.toggleRail')
    expect(sidebar).not.toContain("issueAction('run')")
    expect(sidebar).not.toContain("issueAction('undo')")
  })

  it('switches to node actions when a node is selected', () => {
    expect(sidebar).toContain('wbStore.activeNode')
    expect(sidebar).toContain('run-node')
    expect(sidebar).toContain('save-node-content')
    expect(sidebar).toContain('toggle-gen')
  })

  it('keeps panel state and command bus in the shared store', () => {
    expect(store).toContain('railTab')
    expect(store).toContain('function toggleRail')
    expect(store).toContain('issueAction')
    expect(store).toContain('setActiveNode')
  })
})

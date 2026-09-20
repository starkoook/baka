import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const mediaBlock = (source: string, width: number) => source.match(new RegExp(`@media\\s*\\(max-width:\\s*${width}px\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 's'))?.[1] ?? ''

const page = read('src/views/Tagger.vue')
const queue = read('src/components/tagger/TagQueue.vue')
const editor = read('src/components/tagger/TagEditor.vue')
const progress = read('src/components/tagger/TagRunProgress.vue')

describe('annotation workspace UI', () => {
  it('uses queue, preview, and tag editor columns', () => {
    expect(page).toContain("import TagQueue from '@/components/tagger/TagQueue.vue'")
    expect(page).toContain("import TagEditor from '@/components/tagger/TagEditor.vue'")
    expect(page).toContain("import TagRunProgress from '@/components/tagger/TagRunProgress.vue'")
    expect(page).toContain("import TagSettingsPanel from '@/components/tagger/TagSettingsPanel.vue'")
    expect(page).toContain('class="tagger-layout"')
    expect(page).toContain('class="tagger-workspace"')
    expect(page).not.toContain('class="tagger-shell"')
  })

  it('keeps progress inline and exposes truthful stopping state', () => {
    expect(page).toContain('<TagRunProgress')
    expect(page).toContain('tagger-preview__progress')
    expect(progress).toContain('正在停止')
    expect(progress).toContain('tag-run-progress--compact')
    expect(progress).not.toContain('position: fixed')
  })

  it('uses save-and-next as the primary review action and can return to gallery context', () => {
    expect(editor).toContain('保存并下一张')
    expect(page).toContain('consumeReturnContext()')
    expect(page).toContain('returnToGallery')
  })

  it('shows the picture as a white photo frame with stickers that stay put while the image scrolls, and no mascot', () => {
    expect(page).toContain('class="preview-sticker preview-sticker--tags"')
    expect(page).toContain('class="preview-sticker preview-sticker--threshold"')
    expect(page).not.toContain('tagger-mascot')
    // 滚动区是 .tagger-stage 里面的 .tagger-preview；贴纸 / 指令坞 / 缩放条都不在滚动区内
    const stageStart = page.indexOf('<div class="tagger-stage">')
    const previewClose = page.indexOf('</div>', page.indexOf('class="preview-canvas"'))
    expect(stageStart).toBeGreaterThan(0)
    expect(page.indexOf('class="preview-sticker preview-sticker--tags"')).toBeGreaterThan(previewClose)
    expect(page.indexOf('<nav class="tagger-dock"')).toBeGreaterThan(page.indexOf('</div>', page.indexOf('class="preview-empty"')))
    expect(page).toMatch(/\.tagger-preview\s*\{[^}]*overflow:\s*auto/)
    expect(page).toMatch(/\.tagger-stage\s*\{[^}]*overflow:\s*hidden/)
    expect(page).not.toContain('class="tagger-rail"')
    expect(page).not.toContain('tagger-identity')
    // 相框、队列、编辑器都是白卡片，不再写死深色值
    for (const source of [page, queue, editor, progress]) {
      expect(source).not.toMatch(/#1[0-9a-f]{5}\b/i)
      expect(source).not.toMatch(/rgba\(255,\s*255,\s*255,\s*\.0\d+\)/)
    }
  })

  it('renders the queue as lazy-loaded thumbnails with status badges and stays collapsible', () => {
    expect(queue).toContain('collapsed: boolean')
    expect(queue).toContain('toggleCollapsed: []')
    expect(queue).toContain('IntersectionObserver')
    expect(queue).toContain('getThumbnailUrlByPath')
    expect(queue).toContain('queue-item__badge')
    expect(queue).toMatch(/\.tag-queue--collapsed\s*\{[^}]*width:\s*48px/)
    expect(queue).not.toContain('<strong>队列是空的</strong>')
  })

  it('borrows the workbench behaviours: drag-drop intake, shortcuts, panning, presets, compare, live caption', () => {
    expect(page).toContain('@drop.prevent="onDrop"')
    expect(page).toContain('inspectDroppedPaths(paths)')
    expect(page).toContain("window.addEventListener('keydown', onShortcut)")
    expect(page).toContain("case 'ArrowLeft'")
    expect(page).toContain('@pointerdown="onPanStart"')
    expect(page).toContain('@dblclick="zoomFit"')
    expect(page).toContain('taggerStore.savePreset(name)')
    expect(page).toContain('class="preset-menu"')
    expect(editor).toContain('historyByPath')
    expect(editor).toContain('按住看保存前')
    expect(editor).toContain('serializeWeightedCaption(localTags.value)')
    expect(editor).toContain('function clearAll()')
  })

  it('keeps the primary empty state in the preview only', () => {
    expect(page).toContain('先准备一批图片吧')
    expect(editor).not.toContain('<strong>选择一张图片开始</strong>')
    expect(editor).toContain('<div v-else class="editor-empty"><span>选择图片后在这里校对标签</span></div>')
  })

  it('colors tag groups by category and overlays the editor on narrow screens', () => {
    expect(editor).toContain(':data-group="group"')
    expect(editor).toContain('.tag-group[data-group="角色"] .tag-chip')
    const overlay = mediaBlock(editor, 980)
    expect(overlay).toMatch(/\.tag-editor\s*\{[^}]*position:\s*absolute/)
    expect(overlay).toMatch(/z-index:\s*12/)
    expect(mediaBlock(page, 760)).toMatch(/overflow-x:\s*hidden/)
  })
})

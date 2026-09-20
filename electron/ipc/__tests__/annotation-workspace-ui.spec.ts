import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const mediaBlock = (source: string, width: number) => source.match(new RegExp(`@media\\s*\\(max-width:\\s*${width}px\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 's'))?.[1] ?? ''

const page = read('src/views/Tagger.vue')
const queue = read('src/components/tagger/TagQueue.vue')
const editor = read('src/components/tagger/TagEditor.vue')
const progress = read('src/components/tagger/TagRunProgress.vue')

describe('annotation workspace UI (mint three-column workbench)', () => {
  it('lays out settings, canvas, and tag editor as three columns', () => {
    expect(page).toContain("import TagQueue from '@/components/tagger/TagQueue.vue'")
    expect(page).toContain("import TagEditor from '@/components/tagger/TagEditor.vue'")
    expect(page).toContain("import TagRunProgress from '@/components/tagger/TagRunProgress.vue'")
    expect(page).toContain("import TagSettingsPanel from '@/components/tagger/TagSettingsPanel.vue'")
    expect(page).toContain('class="tg-panel tg-left"')
    expect(page).toContain('class="tg-editor tagger-workspace"')
    expect(page).toMatch(/\.tagger-layout\s*\{[^}]*grid-template-columns:\s*250px minmax\(360px, 1fr\) 300px/)
    expect(page).not.toContain('class="tagger-shell"')
  })

  it('keeps engine, model, thresholds and options inline in the left panel', () => {
    expect(page).toContain('class="tg-tabs" role="tablist"')
    expect(page).toContain('01 · 模型')
    expect(page).toContain('02 · 运行')
    expect(page).toContain('id="tg-threshold"')
    expect(page).toContain('id="tg-char-threshold"')
    expect(page).toContain('管理 / 下载模型')
    expect(page).toContain("onToggleOption('addCharacter', $event)")
    expect(page).toContain('开始自动标注')
  })

  it('puts the image strip under the canvas with quiet toolbar actions', () => {
    expect(page).toContain('class="tg-board" aria-label="图片工作区"')
    expect(page).toContain('class="tg-view-controls"')
    expect(page).toContain('＋ 添加图片')
    expect(page).toContain('导入文件夹')
    expect(queue).toContain('role="listbox"')
    expect(queue).toContain('IntersectionObserver')
    expect(queue).toContain('getThumbnailUrlByPath')
    expect(queue).toContain('queue-item__badge')
    expect(queue).toMatch(/\.queue-list\s*\{[^}]*overflow-x:\s*auto/)
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
    expect(page).toContain('返回图库原位置')
  })

  it('keeps the primary empty state in the canvas only', () => {
    expect(page).toContain('先准备一批图片吧')
    expect(queue).not.toContain('<strong>队列是空的</strong>')
    expect(editor).toContain('<div v-else class="editor-empty"><span>选择图片后在这里校对标签</span></div>')
  })

  it('uses the calm mint palette without leftover dark-theme values', () => {
    expect(page).toContain('--tg-bg: #f5f7f1')
    expect(page).toContain('--tg-primary: #58734a')
    for (const source of [page, queue, editor, progress]) {
      expect(source).not.toMatch(/#1[0-9a-f]{5}\b/i)
      expect(source).not.toMatch(/rgba\(255,\s*255,\s*255,\s*\.0\d+\)/)
    }
    expect(page).not.toContain('tagger-identity')
    expect(page).not.toContain('preview-sticker')
  })

  it('overlays the editor on narrow screens and hides the settings column on tiny ones', () => {
    const overlay = mediaBlock(editor, 980)
    expect(overlay).toMatch(/\.tag-editor\s*\{[^}]*position:\s*absolute/)
    expect(overlay).toMatch(/z-index:\s*12/)
    expect(mediaBlock(page, 760)).toMatch(/overflow-x:\s*hidden/)
    expect(mediaBlock(page, 760)).toMatch(/\.tg-left\s*\{\s*display:\s*none/)
  })
})

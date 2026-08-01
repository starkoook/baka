import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const topLevel = (source: string) => source.replace(/@media[^\{]+\{(?:[^{}]|\{[^{}]*\})*\}/gs, '')
const rules = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...topLevel(source).matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))]
}
const rule = (source: string, selector: string) => rules(source, selector).at(-1)?.[1] ?? ''
const mediaBlock = (source: string, width: number) => source.match(new RegExp(`@media\\s*\\(max-width:\\s*${width}px\\)\\s*\\{([\\s\\S]*?)\\n\\}`, 's'))?.[1] ?? ''
const mediaRule = (source: string, width: number, selector: string) => rule(mediaBlock(source, width), selector)

describe('annotation workspace UI', () => {
  it('uses queue, preview, and tag editor columns', () => {
    const page = read('src/views/Tagger.vue')

    expect(page).toContain("import TagQueue from '@/components/tagger/TagQueue.vue'")
    expect(page).toContain("import TagEditor from '@/components/tagger/TagEditor.vue'")
    expect(page).toContain("import TagRunProgress from '@/components/tagger/TagRunProgress.vue'")
    expect(page).toContain("import TagSettingsPanel from '@/components/tagger/TagSettingsPanel.vue'")
    expect(page).toContain('class="tagger-workspace"')
  })

  it('keeps progress inline and exposes truthful stopping state', () => {
    const page = read('src/views/Tagger.vue')
    const progress = read('src/components/tagger/TagRunProgress.vue')

    expect(page).toContain('<TagRunProgress')
    expect(page).toContain('tagger-preview__progress')
    expect(progress).toContain('正在停止')
    expect(progress).not.toContain('position: fixed')
  })

  it('uses save-and-next as the primary review action and can return to gallery context', () => {
    const page = read('src/views/Tagger.vue')
    const editor = read('src/components/tagger/TagEditor.vue')

    expect(editor).toContain('保存并下一张')
    expect(page).toContain('consumeReturnContext()')
    expect(page).toContain('返回图库原位置')
  })

  it('uses a compact toolbar and keeps the mascot out of annotation', () => {
    const page = read('src/views/Tagger.vue')
    const queue = read('src/components/tagger/TagQueue.vue')
    const progress = read('src/components/tagger/TagRunProgress.vue')

    expect(page).not.toContain('class="tagger-header"')
    expect(page).not.toContain("import Mascot")
    expect(page).not.toContain('<Mascot')
    expect(page).toContain('class="tagger-toolbar"')
    expect(queue).toContain('collapsed: boolean')
    expect(queue).toContain('toggleCollapsed: []')
    expect(progress).toContain('tag-run-progress--compact')
  })

  it('keeps the queue, preview, and editor as spaced tonal zones', () => {
    const page = read('src/views/Tagger.vue')
    const queue = read('src/components/tagger/TagQueue.vue')
    const editor = read('src/components/tagger/TagEditor.vue')

    expect(page).toContain('class="tagger-layout"')
    expect(page).not.toContain('class="tagger-shell"')
    expect(page).not.toContain('.tagger-shell')
    expect(rules(page, '.tagger-layout')).toHaveLength(1)
    expect(rule(page, '.tagger-layout')).toMatch(/gap:\s*14px/)
    expect(rule(page, '.tagger-layout')).toMatch(/border:\s*0/)
    expect(rule(page, '.tagger-layout')).toMatch(/background:\s*transparent/)
    expect(rule(page, '.tagger-layout')).toMatch(/box-shadow:\s*none/)
    expect(rules(queue, '.tag-queue')).toHaveLength(1)
    expect(rule(queue, '.tag-queue')).toMatch(/width:\s*184px/)
    expect(rule(queue, '.tag-queue')).toMatch(/flex:\s*0 0 184px/)
    expect(rule(queue, '.tag-queue')).toMatch(/border:\s*0/)
    expect(rule(queue, '.tag-queue')).toMatch(/border-radius:\s*12px/)
    expect(rules(editor, '.tag-editor')).toHaveLength(1)
    expect(rule(editor, '.tag-editor')).toMatch(/width:\s*300px/)
    expect(rule(editor, '.tag-editor')).toMatch(/flex:\s*0 0 300px/)
    expect(rule(editor, '.tag-editor')).toMatch(/border:\s*0/)
    expect(rule(editor, '.tag-editor')).toMatch(/border-radius:\s*12px/)
    expect(rule(page, '.tagger-preview__toolbar')).toMatch(/border:\s*0/)
    expect(rule(page, '.tagger-preview__progress')).toMatch(/border:\s*0/)
  })

  it('keeps the primary empty state in the preview only', () => {
    const page = read('src/views/Tagger.vue')
    const queue = read('src/components/tagger/TagQueue.vue')
    const editor = read('src/components/tagger/TagEditor.vue')

    expect(page).toContain('先准备一批图片吧')
    expect(queue).not.toContain('<strong>队列是空的</strong>')
    expect(editor).not.toContain('<strong>选择一张图片开始</strong>')
    expect(editor).toContain('<div v-else class="editor-empty"><span>选择图片后在这里校对标签</span></div>')
  })

  it('keeps the workspace usable by overlaying the editor on narrow screens', () => {
    const page = read('src/views/Tagger.vue')
    const editor = read('src/components/tagger/TagEditor.vue')

    expect(mediaRule(page, 1200, '.tagger-layout')).toMatch(/gap:\s*10px/)
    const compact = mediaBlock(page, 760)
    expect(mediaRule(page, 760, '.tagger-page')).toMatch(/overflow-x:\s*hidden/)
    expect(mediaRule(page, 760, '.tagger-layout')).toMatch(/gap:\s*8px/)
    expect(compact).toMatch(/\.tagger-toolbar__status small,\s*\.tagger-toolbar__model,\s*\.tagger-toolbar__actions \.quiet\s*\{\s*display:\s*none/)
    const overlay = mediaRule(editor, 980, '.tag-editor')
    expect(overlay).toMatch(/position:\s*absolute/)
    expect(overlay).toMatch(/z-index:\s*12/)
    expect(overlay).toMatch(/top:\s*0/)
    expect(overlay).toMatch(/right:\s*0/)
    expect(overlay).toMatch(/bottom:\s*0/)
    expect(overlay).toMatch(/width:\s*min\(300px,\s*calc\(100%\s*-\s*64px\)\)/)
    expect(overlay).toMatch(/box-shadow:/)
  })

  it('keeps the queue collapsed and narrows it progressively', () => {
    const queue = read('src/components/tagger/TagQueue.vue')
    const collapsed = rule(queue, '.tag-queue--collapsed')

    expect(collapsed).toMatch(/width:\s*48px/)
    expect(collapsed).toMatch(/flex-basis:\s*48px/)
    expect(rules(queue, '.tag-queue--collapsed')).toHaveLength(1)
    expect(queue).toMatch(/\.tag-queue\s*\{[^}]*width:\s*184px[^}]*\}\s*\.tag-queue--collapsed\s*\{/s)
    expect(queue.indexOf('@media (max-width: 1200px)')).toBeLessThan(queue.indexOf('@media (max-width: 850px)'))
    expect(mediaBlock(queue, 1200)).toMatch(/^\s*\.tag-queue:not\(\.tag-queue--collapsed\)\s*\{/)
    expect(mediaBlock(queue, 850)).toMatch(/^\s*\.tag-queue:not\(\.tag-queue--collapsed\)\s*\{/)
    expect(mediaRule(queue, 1200, '.tag-queue:not(.tag-queue--collapsed)')).toMatch(/width:\s*166px/)
    expect(mediaRule(queue, 1200, '.tag-queue:not(.tag-queue--collapsed)')).toMatch(/flex-basis:\s*166px/)
    expect(mediaRule(queue, 850, '.tag-queue:not(.tag-queue--collapsed)')).toMatch(/width:\s*154px/)
    expect(mediaRule(queue, 850, '.tag-queue:not(.tag-queue--collapsed)')).toMatch(/flex-basis:\s*154px/)
  })
})

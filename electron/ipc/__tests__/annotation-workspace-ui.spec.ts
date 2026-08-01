import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const rule = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const topLevel = source.replace(/@media[^\{]+\{(?:[^{}]|\{[^{}]*\})*\}/gs, '')
  const matches = [...topLevel.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))]
  return matches[matches.length - 1]?.[1] ?? ''
}

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
    expect(rule(page, '.tagger-layout')).toMatch(/gap:\s*14px/)
    expect(rule(page, '.tagger-layout')).toMatch(/border:\s*0/)
    expect(rule(page, '.tagger-layout')).toMatch(/background:\s*transparent/)
    expect(rule(page, '.tagger-layout')).toMatch(/box-shadow:\s*none/)
    expect(rule(queue, '.tag-queue')).toMatch(/border:\s*0/)
    expect(rule(editor, '.tag-editor')).toMatch(/border:\s*0/)
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
  })

  it('keeps the workspace usable by overlaying the editor on narrow screens', () => {
    const page = read('src/views/Tagger.vue')
    const editor = read('src/components/tagger/TagEditor.vue')

    expect(page).toMatch(/@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*?\.tagger-layout/)
    expect(page).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*?overflow-x:\s*hidden/)
    expect(editor).toMatch(/@media\s*\(max-width:\s*980px\)\s*\{[\s\S]*?\.tag-editor\s*\{[\s\S]*?position:\s*absolute/)
  })
})

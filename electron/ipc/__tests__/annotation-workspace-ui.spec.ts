import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

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
})

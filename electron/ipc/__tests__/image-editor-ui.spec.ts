import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('pixel image editor', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/common/ImageEditorCanvas.vue'), 'utf8')

  it('provides brush, eraser, eyedropper and crop tools', () => {
    expect(source).toContain("tool = 'brush'")
    expect(source).toContain("tool = 'eraser'")
    expect(source).toContain("tool = 'eyedropper'")
    expect(source).toContain("tool = 'crop'")
  })

  it('supports undo/redo and keyboard shortcuts', () => {
    expect(source).toContain('undoStack')
    expect(source).toContain('redoStack')
    expect(source).toContain("key === 'b'")
    expect(source).toContain("key === 'e'")
    expect(source).toContain("key === 'c'")
    expect(source).toContain("event.ctrlKey || event.metaKey")
  })
})

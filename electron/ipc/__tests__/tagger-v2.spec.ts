import { describe, expect, it, vi } from 'vitest'
import { applyTagOperation } from '../tagger-v2.js'

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined },
}))

vi.mock('../onnx-inference.js', () => ({
  runOnnxInference: vi.fn(async ({ imagePaths }) => imagePaths.map((path: string) => ({ path, tags: [] }))),
}))

vi.mock('../tagger-settings.js', async () => {
  const actual = await vi.importActual<typeof import('../tagger-settings.js')>('../tagger-settings.js')
  return actual
})

describe('tagger v2 tag operations', () => {
  it('adds, removes, and replaces tags', () => {
    expect(applyTagOperation(['1girl'], { type: 'add', tags: ['smile'] })).toEqual(['1girl', 'smile'])
    expect(applyTagOperation(['1girl', 'smile'], { type: 'remove', tags: ['smile'] })).toEqual(['1girl'])
    expect(applyTagOperation(['blue_hair'], { type: 'replace', tags: ['blue_hair'], replaceWith: 'aqua_hair' })).toEqual(['aqua_hair'])
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../gallery', () => ({
  ensureDb: vi.fn(async () => undefined),
  queryAll: vi.fn(() => []),
  runSql: vi.fn(),
}))
vi.mock('../safe-file', () => ({ writeTextSafe: vi.fn(async () => ({ success: true })) }))
vi.mock('../file-history', () => ({
  createHistoryRecord: vi.fn(async () => ({ success: true, id: 1 })),
  restoreVersion: vi.fn(async () => ({ success: true, targetPath: '' })),
  listVersions: vi.fn(async () => []),
}))

const {
  applyAddFields,
  applyFindReplace,
  convertAnimaToBooruTag,
  convertBooruTagToAnima,
  normalizeAnnotationText,
  transformAnnotationText,
} = require('../annotation-tools.js')

describe('annotation tools', () => {
  it('converts booru tags to anima with quality words', async () => {
    expect(await convertBooruTagToAnima('1girl, long_hair, blue eyes', { qualityWordPlacement: 'prefix' }))
      .toContain('masterpiece, best quality, score_7, score_8, score_9')
    expect(await convertBooruTagToAnima('1girl, touhou, solo', { qualityWordPlacement: 'prefix', addStylePrefix: true }))
      .toContain('@touhou')
  })

  it('converts anima back to booru tags and strips prefixes/quality words', async () => {
    const anima = await convertBooruTagToAnima('1girl, @touhou, solo', { qualityWordPlacement: 'prefix' })
    const result = convertAnimaToBooruTag(anima, { qualityWordPlacement: 'remove' })
    expect(result).not.toContain('@')
    expect(result).not.toMatch(/masterpiece|score_/)
    expect(result).toContain('1girl')
    expect(result).toContain('solo')
  })

  it('normalizes caption text', () => {
    expect(normalizeAnnotationText('Long_Hair, best quality, long_hair', {
      lowercase: true,
      halfWidth: true,
      underscoreToSpace: true,
      removeJunk: true,
      dedupe: true,
    })).toBe('long hair')
    expect(normalizeAnnotationText('tag1，tag2', { halfWidth: true, dedupe: true })).toBe('tag1, tag2')
  })

  it('finds and replaces text', () => {
    expect(applyFindReplace('blue hair, blue eyes', { find: 'blue', replace: 'aqua' }))
      .toBe('aqua hair, aqua eyes')
    expect(applyFindReplace('Blue hair', { find: 'blue', replace: 'aqua', ignoreCase: true }))
      .toBe('aqua hair')
  })

  it('adds fields to each tag', () => {
    expect(applyAddFields('1girl, solo', { prefix: 'masterpiece, ', suffix: ', 8k' }))
      .toBe('masterpiece, 1girl, 8k, masterpiece, solo, 8k')
    expect(applyAddFields('1girl, solo', { wrapNewLine: true, prefix: '(', suffix: ')' }))
      .toBe('(1girl, solo)')
  })

  it('routes tools through the unified entry', async () => {
    expect(await transformAnnotationText('Long_Hair, LONG_HAIR', {
      type: 'normalize',
      options: { lowercase: true, underscoreToSpace: true, dedupe: true },
    })).toBe('long hair')
    expect(await transformAnnotationText('blue hair', {
      type: 'find-replace',
      options: { find: 'blue', replace: 'aqua' },
    })).toBe('aqua hair')
  })
})

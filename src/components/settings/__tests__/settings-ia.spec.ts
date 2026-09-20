import { describe, expect, it } from 'vitest'
import { inferDataRoot, normalizeCacheSize, SETTINGS_SECTIONS } from '../settings-ia'

describe('settings information architecture', () => {
  it('keeps the sidebar sections in the designed order', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      'general',
      'appearance',
      'models',
      'api',
      'network',
      'local',
      'components',
      'about',
    ])
  })

  it('uses Chinese labels for the sidebar', () => {
    expect(SETTINGS_SECTIONS[0].label).toBe('通用')
    expect(SETTINGS_SECTIONS[5].label).toBe('本地')
  })

  it('infers BakaTOOLS-data from the ONNX model directory', () => {
    expect(inferDataRoot('D:\\baka\\BakaTOOLS-data\\tagger-models')).toBe('D:\\baka\\BakaTOOLS-data')
    expect(inferDataRoot('/opt/BakaTOOLS-data/tagger-models/')).toBe('/opt/BakaTOOLS-data')
    expect(inferDataRoot('')).toBe('')
  })

  it('normalizes the cache:getSize map used by Electron', () => {
    const result = normalizeCacheSize({
      '应用缓存': { size: 2048 },
      'GPU 缓存': { size: 128 },
    })
    expect(result.total).toBe('2.0 MB')
    expect(result.items).toHaveLength(2)
    expect(result.items[0].size).toBe('2.0 MB')
  })

  it('passes through the already-normalized renderer shape', () => {
    expect(normalizeCacheSize({ items: [{ name: 'thumbs', size: '12 KB' }], total: '12 KB' })).toEqual({
      items: [{ name: 'thumbs', size: '12 KB' }],
      total: '12 KB',
    })
  })
})

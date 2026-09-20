import { describe, expect, it } from 'vitest'
import { diffTags, serializeWeightedCaption } from '../caption'
import {
  MAX_TAGGER_PRESETS,
  deleteTaggerPreset,
  loadTaggerPresets,
  matchesPreset,
  saveTaggerPreset,
  type PresetStorage,
  type TaggerPresetInput,
} from '../presets'

function memoryStorage(): PresetStorage {
  const map = new Map<string, string>()
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) } }
}

const baseInput: TaggerPresetInput = {
  tagSource: 'local',
  modelPath: 'D:/models/wd-eva02.onnx',
  threshold: 0.35,
  characterThreshold: 0.85,
  addCharacter: true,
  addCopyright: true,
  replaceUnderscores: false,
}

describe('caption serialization', () => {
  it('writes weights in the same SD format as the main process', () => {
    expect(serializeWeightedCaption([
      { tag: '1girl' },
      { tag: 'pink_hair', weight: 1.2 },
      { tag: 'blush', weight: 0.8 },
      { tag: '  ', weight: 2 },
      'masterpiece',
    ])).toBe('1girl, (pink_hair:1.2), [blush:0.8], masterpiece')
    expect(serializeWeightedCaption([{ tag: 'solo', weight: 1.0004 }])).toBe('solo')
  })

  it('diffs saved tags against the current edit', () => {
    const diff = diffTags(
      [{ tag: '1girl' }, { tag: 'smile' }, { tag: 'hat' }],
      [{ tag: '1girl' }, { tag: 'smile' }, { tag: 'ribbon' }],
    )
    expect(diff).toEqual({ added: ['ribbon'], removed: ['hat'], unchanged: 2 })
  })
})

describe('tagger presets', () => {
  it('saves, matches, overwrites by name and deletes', () => {
    const storage = memoryStorage()
    expect(loadTaggerPresets(storage)).toEqual([])

    let presets = saveTaggerPreset(storage, '  角色特写  ', baseInput)
    expect(presets).toHaveLength(1)
    expect(presets[0].name).toBe('角色特写')
    expect(matchesPreset(presets[0], baseInput)).toBe(true)
    expect(matchesPreset(presets[0], { ...baseInput, threshold: 0.5 })).toBe(false)

    presets = saveTaggerPreset(storage, '角色特写', { ...baseInput, threshold: 0.5 })
    expect(presets).toHaveLength(1)
    expect(presets[0].threshold).toBe(0.5)

    presets = saveTaggerPreset(storage, '背景', { ...baseInput, tagSource: 'combined' })
    expect(presets.map((preset) => preset.name)).toEqual(['背景', '角色特写'])

    presets = deleteTaggerPreset(storage, presets[1].id)
    expect(presets.map((preset) => preset.name)).toEqual(['背景'])
    expect(loadTaggerPresets(storage)).toHaveLength(1)
  })

  it('ignores garbage, clamps thresholds and caps the list', () => {
    const storage = memoryStorage()
    storage.setItem('baka-tagger-presets-v1', JSON.stringify([{ name: '' }, 42, { name: 'ok', threshold: 9, characterThreshold: -1, tagSource: 'weird' }]))
    const presets = loadTaggerPresets(storage)
    expect(presets).toHaveLength(1)
    expect(presets[0]).toMatchObject({ name: 'ok', threshold: 1, characterThreshold: 0, tagSource: 'local' })

    expect(saveTaggerPreset(storage, '', baseInput)).toHaveLength(1)
    for (let i = 0; i < MAX_TAGGER_PRESETS + 5; i++) saveTaggerPreset(storage, `p${i}`, baseInput)
    expect(loadTaggerPresets(storage)).toHaveLength(MAX_TAGGER_PRESETS)
  })
})

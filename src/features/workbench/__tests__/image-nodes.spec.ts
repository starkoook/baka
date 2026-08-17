import { describe, expect, it } from 'vitest'
import { applyMetadataDefaults, arrangeDroppedImages } from '../image-nodes'

describe('image node metadata defaults', () => {
  it('fills only untouched fields', () => {
    const result = applyMetadataDefaults(
      { editPrompt: '', model: '', outputSize: '', touched: {} },
      { prompt: '1girl, pink hair', model: 'anime.safetensors', width: 768, height: 1024 },
      ['anime.safetensors'],
    )

    expect(result).toMatchObject({ editPrompt: '1girl, pink hair', model: 'anime.safetensors', outputSize: '768x1024' })
  })

  it('never overwrites user-edited values', () => {
    const result = applyMetadataDefaults(
      { editPrompt: '换成夜景', model: 'mine.safetensors', outputSize: '1024x1024', touched: { editPrompt: true, model: true, outputSize: true } },
      { prompt: 'original', model: 'other.safetensors', width: 768, height: 1024 },
      ['other.safetensors'],
    )

    expect(result).toMatchObject({ editPrompt: '换成夜景', model: 'mine.safetensors', outputSize: '1024x1024' })
  })

  it('does not select metadata models missing from the active engine', () => {
    const result = applyMetadataDefaults(
      { editPrompt: '', model: '', outputSize: '', touched: {} },
      { model: 'missing.safetensors' },
      ['available.safetensors'],
    )

    expect(result.model).toBe('')
  })

  it('arranges multiple dropped images without overlap', () => {
    expect(arrangeDroppedImages({ x: 100, y: 200 }, 3, 300)).toEqual([
      { x: 100, y: 200 }, { x: 424, y: 200 }, { x: 748, y: 200 },
    ])
  })
})

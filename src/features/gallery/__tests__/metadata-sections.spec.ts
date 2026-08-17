import { describe, expect, it } from 'vitest'
import { buildMetadataSections, formatAllMetadata } from '../metadata-sections'

describe('metadata sections', () => {
  it('omits empty generation sections', () => {
    const result = buildMetadataSections({ hasMetadata: false }, [])

    expect(result.overview).toEqual([])
    expect(result.generation).toEqual([])
    expect(result.tags).toEqual([])
  })

  it('keeps numeric zero values such as cfg and seed', () => {
    const result = buildMetadataSections({ hasMetadata: true, cfg: 0, seed: 0 }, [])

    expect(result.overview).toEqual([
      { key: 'cfg', label: 'CFG', value: 0 },
      { key: 'seed', label: 'Seed', value: 0 },
    ])
  })

  it('separates prompts from overview facts and includes tags', () => {
    const result = buildMetadataSections(
      { hasMetadata: true, model: 'anime-v1', prompt: '1girl', negative: 'low quality' },
      [{ tag: 'blue_hair', category: 'general', confidence: 0.91 }],
    )

    expect(result.overview[0]).toEqual({ key: 'model', label: '模型', value: 'anime-v1' })
    expect(result.generation.map((field) => field.key)).toEqual(['prompt', 'negative'])
    expect(result.tags[0].tag).toBe('blue_hair')
  })

  it('formats only populated metadata for copying', () => {
    const text = formatAllMetadata({ hasMetadata: true, model: 'anime-v1', seed: 12 })

    expect(text).toContain('模型: anime-v1')
    expect(text).toContain('Seed: 12')
    expect(text).not.toContain('Prompt:')
  })

  it('combines active LoRAs into one multi-line field and keeps raw metadata separate', () => {
    const result = buildMetadataSections({
      hasMetadata: true,
      loras: [
        { name: 'style\\mikage', displayName: 'mikage style', weight: 0.4, textEncoderWeight: 0.8 },
        { name: 'detail_boost', weight: 0.65 },
      ],
      rawMetadata: { prompt: '{"1":{"class_type":"WeiLinLoraLoader"}}', custom: 'kept' },
    }, [])

    expect(result.overview).toContainEqual({
      key: 'lora',
      label: 'LoRA',
      value: 'mikage style · 模型 0.4 · 文本编码器 0.8\ndetail_boost · 模型 0.65',
    })
    expect(result.overview.filter((field) => field.label === 'LoRA').length).toBe(1)
    expect(result.raw).toEqual([
      { key: 'rawMetadata', label: '原始元数据', value: JSON.stringify({ prompt: { '1': { class_type: 'WeiLinLoraLoader' } }, custom: 'kept' }, null, 2) },
    ])
  })
})

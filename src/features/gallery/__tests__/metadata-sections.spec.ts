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

  it('does not show a model+LoRA blob as \u6b63\u5411\u63d0\u793a\u8bcd', () => {
    const style = '\u98ce\u683c'
    const userString = `qwen3vl_4b_fp8_scaled (1).safetensors, ${JSON.stringify([
      { name: `krea2${style}\\wlop_c1-st4000`, weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'a.safetensors', lora: 'a.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'second', weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'b.safetensors', lora: 'b.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'third', weight: 0.5, text_encoder_weight: 1, hidden: false, display_name: 'c.safetensors', lora: 'c.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'fourth', weight: 1, text_encoder_weight: 1, hidden: false, display_name: 'd.safetensors', lora: 'd.safetensors', trigger_weight: 1, loraWorks: '' },
    ])}`
    const result = buildMetadataSections({ hasMetadata: true, prompt: userString, model: 'x' }, [])
    expect(result.generation.some((field) => field.label === '\u6b63\u5411\u63d0\u793a\u8bcd')).toBe(false)
    expect(result.generation.map((field) => field.key)).not.toContain('prompt')
    expect(result.overview).toContainEqual({ key: 'model', label: '\u6a21\u578b', value: 'x' })
  })

  it('still shows a real caption as \u6b63\u5411\u63d0\u793a\u8bcd', () => {
    const result = buildMetadataSections({ hasMetadata: true, prompt: '1girl, solo, smile', model: 'x' }, [])
    expect(result.generation).toContainEqual({ key: 'prompt', label: '\u6b63\u5411\u63d0\u793a\u8bcd', value: '1girl, solo, smile' })
  })

  it('does not show a bare LoRA JSON array as \u6b63\u5411\u63d0\u793a\u8bcd', () => {
    const prompt = JSON.stringify([
      { name: 'style\\foo', weight: 0.5, text_encoder_weight: 1, loraWorks: '' },
    ])
    const result = buildMetadataSections({ hasMetadata: true, prompt, model: 'x' }, [])
    expect(result.generation.map((field) => field.key)).not.toContain('prompt')
  })

  it('still shows WeiLin artwork XML as \u6b63\u5411\u63d0\u793a\u8bcd', () => {
    const prompt = '<artwork id="celestial_conservatory_waltz_masterpiece"><scene>waltz</scene></artwork>'
    const result = buildMetadataSections({ hasMetadata: true, prompt, model: 'x' }, [])
    expect(result.generation).toContainEqual({ key: 'prompt', label: '\u6b63\u5411\u63d0\u793a\u8bcd', value: prompt })
  })
})

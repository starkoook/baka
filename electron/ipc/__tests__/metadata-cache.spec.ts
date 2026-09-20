import { describe, expect, it } from 'vitest'
import {
  METADATA_CACHE_VERSION,
  galleryCacheNeedsReparse,
  galleryIndexCacheIsReusable,
  isModelLoraBlobPrompt,
  stampMetadataCache,
} from '../metadata-cache.js'

const blob = 'qwen3vl_4b_fp8_scaled (1).safetensors, [{"name":"krea2","weight":0.4,"text_encoder_weight":1}]'
const xml = '<artwork id="celestial_conservatory_waltz_masterpiece"><scene>waltz</scene></artwork>'

describe('gallery metadata cache bust', () => {
  it('treats model+LoRA dumps as stale prompts and keeps WeiLin XML', () => {
    expect(isModelLoraBlobPrompt(blob)).toBe(true)
    expect(isModelLoraBlobPrompt(xml)).toBe(false)
  })

  it('reparses unversioned cached blobs and accepts stamped XML captions', () => {
    const cached = { prompt: blob, model: 'turbo.safetensors', loras: [{ name: 'a', weight: 1 }], rawMetadata: { prompt: '{}' } }
    expect(galleryCacheNeedsReparse(cached)).toBe(true)
    expect(galleryIndexCacheIsReusable(JSON.stringify(cached))).toBe(false)

    const stamped = stampMetadataCache({ prompt: xml, model: 'turbo.safetensors' })
    expect(stamped.metadataCacheVersion).toBe(METADATA_CACHE_VERSION)
    expect(galleryCacheNeedsReparse(stamped)).toBe(false)
    expect(galleryIndexCacheIsReusable(JSON.stringify(stamped))).toBe(true)
  })
})

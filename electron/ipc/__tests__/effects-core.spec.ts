import { describe, expect, it } from 'vitest'
import { applyEffectChain } from '../effects-core.js'

describe('effects core', () => {
  it('applies brightness and clamps to white', () => {
    const data = new Uint8Array([100, 100, 100, 255])
    const out = applyEffectChain(data, 1, 1, [{ type: 'brightnessContrast', value1: 1, value2: 0 }])
    expect(out[0]).toBe(255)
    expect(out[1]).toBe(255)
    expect(out[2]).toBe(255)
  })

  it('moves every channel toward mid-gray at minimum contrast', () => {
    const data = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255])
    const out = applyEffectChain(data, 2, 1, [{ type: 'brightnessContrast', value1: 0, value2: -1 }])
    expect(out[0]).toBe(128)
    expect(out[4]).toBe(128)
  })

  it('pixelates an image block into its average color', () => {
    const data = new Uint8Array([
      0, 0, 0, 255,
      255, 255, 255, 255,
      100, 100, 100, 255,
      200, 200, 200, 255,
    ])
    const out = applyEffectChain(data, 2, 2, [{ type: 'pixelate', value1: 2 }])
    const avg = Math.round((0 + 255 + 100 + 200) / 4)
    for (let i = 0; i < 4; i++) {
      expect(out[i * 4]).toBe(avg)
      expect(out[i * 4 + 1]).toBe(avg)
      expect(out[i * 4 + 2]).toBe(avg)
    }
  })

  it('fills a solid block region with a color', () => {
    const data = new Uint8Array(4 * 4)
    data.fill(255, 3)
    const out = applyEffectChain(data, 2, 2, [{
      type: 'solidBlock',
      textValue: '#ff0000',
      value1: 0.5,
      value2: 0.5,
      value3: 1,
      value4: 1,
    }])
    for (let i = 0; i < 4; i++) {
      expect(out[i * 4]).toBe(255)
      expect(out[i * 4 + 1]).toBe(0)
      expect(out[i * 4 + 2]).toBe(0)
    }
  })

  it('brightens a bright pixel with glow', () => {
    const data = new Uint8Array([100, 100, 100, 255])
    const out = applyEffectChain(data, 1, 1, [{ type: 'glow', value1: 0, value2: 1, value3: 1 }])
    expect(out[0]).toBe(200)
  })

  it('keeps a single-pixel radial blur unchanged', () => {
    const data = new Uint8Array([10, 20, 30, 255])
    const out = applyEffectChain(data, 1, 1, [{ type: 'radialBlur', value1: 0.8, value2: 0.5, value3: 0.5, value4: 8 }])
    expect(Array.from(out)).toEqual([10, 20, 30, 255])
  })

  it('keeps a single-pixel chromatic aberration unchanged', () => {
    const data = new Uint8Array([10, 20, 30, 255])
    const out = applyEffectChain(data, 1, 1, [{ type: 'chromaticAberration', value1: 3 }])
    expect(Array.from(out)).toEqual([10, 20, 30, 255])
  })

  it('averages a block at maximum jpeg loss', () => {
    const data = new Uint8Array([
      0, 0, 0, 255,
      255, 255, 255, 255,
      100, 100, 100, 255,
      200, 200, 200, 255,
    ])
    const out = applyEffectChain(data, 2, 2, [{ type: 'jpegLoss', value1: 1, value2: 0, value3: 2 }])
    const avg = Math.round((0 + 255 + 100 + 200) / 4)
    for (let i = 0; i < 4; i++) {
      expect(out[i * 4]).toBe(avg)
      expect(out[i * 4 + 1]).toBe(avg)
      expect(out[i * 4 + 2]).toBe(avg)
    }
  })
})

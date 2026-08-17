import { describe, expect, it } from 'vitest'
import { MODEL_FAMILIES, ONNX_MODEL_CATALOG } from '../onnx-tagger.js'

describe('onnx tagger catalog', () => {
  it('defines model families', () => {
    expect(MODEL_FAMILIES.map(family => family.id)).toEqual(['wd14', 'pixai', 'cl'])
    expect(ONNX_MODEL_CATALOG.length).toBeGreaterThan(0)
  })
})

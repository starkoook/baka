import { describe, expect, it } from 'vitest'
import {
  applySigmoidIfNeeded,
  parseTagLabels,
  resolveInputLayout,
  selectOutputNames,
} from '../tagger-layout.js'

describe('tagger layout helpers', () => {
  it('detects NCHW and NHWC input layouts', () => {
    expect(resolveInputLayout([1, 3, 448, 448])).toBe('nchw')
    expect(resolveInputLayout([1, 448, 448, 3])).toBe('nhwc')
  })

  it('prefers the output whose dimensions match the label count', () => {
    const outputMetadata = {
      logits: [1, 100],
      probs: [1, 100, 1],
    }
    expect(selectOutputNames(outputMetadata, 100)).toEqual(['logits', 'probs'])
  })

  it('applies sigmoid only when values are outside probability range', () => {
    expect(applySigmoidIfNeeded([0.2, 0.8, 1])).toEqual([0.2, 0.8, 1])
    const result = applySigmoidIfNeeded([2, 0])
    expect(result[0]).toBeCloseTo(0.8807970779778823)
    expect(result[1]).toBeCloseTo(0.5)
  })

  it('parses WD14 and plain CSV label formats with categories', () => {
    const wd = 'tag_id,name,category,count\n0,1girl,0,100\n1,hatsune_miku,4,50\n'
    const plain = 'long_hair\nshort_hair\n'

    expect(parseTagLabels(wd)).toEqual([
      { name: '1girl', category: 0 },
      { name: 'hatsune_miku', category: 4 },
    ])
    expect(parseTagLabels(plain)).toEqual([
      { name: 'long_hair', category: 0 },
      { name: 'short_hair', category: 0 },
    ])
  })
})

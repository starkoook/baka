import { describe, expect, it } from 'vitest'
import { serializeWeightedCaption, parseWeightedCaption, parseWeightedTag, serializeTag, convertWeightedCaption } from '../tag-weight.js'

describe('tag weight', () => {
  it('serializes normal tags without decoration', () => {
    expect(serializeWeightedCaption([
      { tag: '1girl', weight: 1 },
      { tag: 'long hair', weight: undefined },
    ])).toBe('1girl, long hair')
  })

  it('serializes emphasized and de-emphasized tags', () => {
    expect(serializeTag('1girl', 1.2)).toBe('(1girl:1.2)')
    expect(serializeTag('long hair', 0.8)).toBe('[long hair:0.8]')
  })

  it('parses weighted captions back into tags', () => {
    const tags = parseWeightedCaption('(1girl:1.2), [long hair:0.8], blue eyes')
    expect(tags).toEqual([
      { tag: '1girl', weight: 1.2 },
      { tag: 'long hair', weight: 0.8 },
      { tag: 'blue eyes', weight: 1 },
    ])
  })

  it('parses a single weighted tag', () => {
    expect(parseWeightedTag('(1girl:1.3)')).toEqual({ tag: '1girl', weight: 1.3 })
    expect(parseWeightedTag('normal')).toEqual({ tag: 'normal', weight: 1 })
  })

  it('serializes NAI numeric weights as number::tag::', () => {
    expect(serializeTag('1girl', 1.2, 'naiNumeric')).toBe('1.2::1girl::')
    expect(serializeTag('long hair', 0.8, 'naiNumeric')).toBe('0.8::long hair::')
    expect(serializeTag('blue eyes', 1, 'naiNumeric')).toBe('blue eyes')
  })

  it('serializes NAI classic weights with brace nesting', () => {
    expect(serializeTag('1girl', 1.05, 'naiClassic')).toBe('{1girl}')
    expect(serializeTag('long hair', 0.95, 'naiClassic')).toBe('[long hair]')
    expect(serializeTag('blue eyes', 1, 'naiClassic')).toBe('blue eyes')
  })

  it('converts SD captions to NAI numeric and classic', () => {
    const caption = '(1girl:1.2), [long hair:0.8], blue eyes'
    expect(convertWeightedCaption(caption, 'sd', 'naiNumeric'))
      .toBe('1.2::1girl::, 0.8::long hair::, blue eyes')
    expect(convertWeightedCaption(caption, 'sd', 'naiClassic'))
      .toBe('{{{{1girl}}}}, [[[[[long hair]]]]], blue eyes')
  })
})

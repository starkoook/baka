import { describe, expect, it } from 'vitest'
import { applyTagOperation } from '../tagger-v2.js'

describe('bulk tag edit', () => {
  it('adds, removes, replaces, and cleans up tags', () => {
    expect(applyTagOperation(['1girl', 'solo'], { type: 'add', tags: ['blue_hair'] })).toEqual(['1girl', 'solo', 'blue_hair'])
    expect(applyTagOperation(['1girl', 'solo'], { type: 'remove', tags: ['solo'] })).toEqual(['1girl'])
    expect(applyTagOperation(['blue_hair'], { type: 'replace', tags: ['blue_hair'], replaceWith: 'aqua_hair' })).toEqual(['aqua_hair'])
    expect(applyTagOperation(['2girls', 'solo', '2girls'], { type: 'cleanup' })).toEqual(['2girls'])
  })
})

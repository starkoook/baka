import { describe, expect, it } from 'vitest'
import { mergeTagLists } from '../tag-merge.js'

describe('tag merge', () => {
  it('returns the union by default', () => {
    expect(mergeTagLists(['1girl', 'blue eyes'], ['1girl', 'solo'])).toEqual(['1girl', 'blue eyes', 'solo'])
  })

  it('returns the intersection', () => {
    expect(mergeTagLists(['1girl', 'blue eyes'], ['1girl', 'solo'], 'intersect')).toEqual(['1girl'])
  })

  it('returns the difference of the first set', () => {
    expect(mergeTagLists(['1girl', 'blue eyes'], ['1girl'], 'difference')).toEqual(['blue eyes'])
  })

  it('supports a_only and b_only', () => {
    expect(mergeTagLists(['1girl'], ['solo'], 'a_only')).toEqual(['1girl'])
    expect(mergeTagLists(['1girl'], ['solo'], 'b_only')).toEqual(['solo'])
  })
})

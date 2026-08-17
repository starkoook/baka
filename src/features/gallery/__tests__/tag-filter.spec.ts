import { describe, expect, it } from 'vitest'
import { parseSearchQuery, matchesQuery } from '../tag-filter'

describe('gallery tag filter', () => {
  it('returns no clauses for an empty query', () => {
    expect(parseSearchQuery('')).toEqual([])
  })

  it('parses include and exclude terms', () => {
    expect(parseSearchQuery('1girl -solo')).toEqual([
      { include: ['1girl'], exclude: ['solo'] },
    ])
  })

  it('parses OR groups separated by |', () => {
    expect(parseSearchQuery('1girl long hair | 2girls')).toEqual([
      { include: ['1girl', 'long', 'hair'], exclude: [] },
      { include: ['2girls'], exclude: [] },
    ])
  })

  it('matches AND and NOT semantics', () => {
    const clauses = parseSearchQuery('1girl -solo')
    expect(matchesQuery('1girl long hair', clauses)).toBe(true)
    expect(matchesQuery('1girl solo', clauses)).toBe(false)
    expect(matchesQuery('2girls long hair', clauses)).toBe(false)
  })

  it('matches OR groups', () => {
    const clauses = parseSearchQuery('1girl | 2girls')
    expect(matchesQuery('1girl solo', clauses)).toBe(true)
    expect(matchesQuery('2girls solo', clauses)).toBe(true)
    expect(matchesQuery('3girls solo', clauses)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { fixSubjectCount, mergeChildTags } from '../character-tag-decisions.js'

describe('character tag decisions', () => {
  it('removes solo from multi-girl images', () => {
    expect(fixSubjectCount(['2girls', 'solo'])).toEqual(['2girls'])
  })

  it('keeps parent tags and removes child duplicates', () => {
    const parentByChild = new Map([['racing_miku', 'hatsune_miku']])
    expect(mergeChildTags(['hatsune_miku', 'racing_miku'], parentByChild)).toEqual(['hatsune_miku'])
  })
})

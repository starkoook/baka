import { describe, expect, it } from 'vitest'
import { postprocessTags, parseStructuredOutput } from '../tagging-postprocess.js'

describe('tagging postprocess', () => {
  it('parses structured tags and natural language', () => {
    const raw = '<TAGS>\n1girl, long hair, blue eyes\n</TAGS>\n<NL>\n一个蓝色长发的女孩\n</NL>'
    const result = parseStructuredOutput(raw)
    expect(result.tags).toEqual(['1girl', 'long hair', 'blue eyes'])
    expect(result.natural).toBe('一个蓝色长发的女孩')
  })

  it('deduplicates and applies prefix/suffix', () => {
    const result = postprocessTags(['1girl', 'long hair', 'long hair', 'blue_eyes'], {
      prefix: 'anime',
      suffix: 'style',
      replaceUnderscores: true,
    })
    expect(result).toEqual(['anime 1girl style', 'anime long hair style', 'anime blue eyes style'])
  })
})

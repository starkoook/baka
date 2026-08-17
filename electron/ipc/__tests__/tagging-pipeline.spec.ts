import { describe, expect, it } from 'vitest'
import { PROMPT_TEMPLATES, buildPrompt } from '../tagging-pipeline.js'

describe('tagging pipeline', () => {
  it('builds prompts from the selected template', () => {
    expect(buildPrompt('natural', { extra: 'Be detailed.' })).toContain('natural language')
    expect(buildPrompt('danbooru-tags')).toContain('Danbooru tags')
    expect(PROMPT_TEMPLATES.map(template => template.id)).toEqual(['danbooru-tags', 'natural', 'tags-and-natural'])
  })
})

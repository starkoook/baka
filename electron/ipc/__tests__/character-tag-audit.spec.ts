import { describe, expect, it } from 'vitest'
import { buildInventory, applyInventoryDecisions, auditInventory } from '../character-tag-audit.js'

describe('character tag audit', () => {
  it('builds a tag inventory', () => {
    const inventory = buildInventory([
      { path: 'a.png', tags: ['1girl', 'blue_hair'] },
      { path: 'b.png', tags: ['1girl', 'red_hair'] },
    ])
    expect(inventory.find(item => item.tag === '1girl').count).toBe(2)
  })

  it('applies decisions', () => {
    const items = [
      { path: 'a.png', tags: ['1girl', 'blue_hair'] },
      { path: 'b.png', tags: ['2girls', 'solo'] },
    ]
    const applied = applyInventoryDecisions(items, [
      { tag: 'blue_hair', type: 'replace', target: 'aqua_hair' },
      { tag: 'solo', type: 'delete' },
    ])
    expect(applied[0].tags).toEqual(['1girl', 'aqua_hair'])
    expect(applied[1].tags).toEqual(['2girls'])
  })

  it('runs LLM audit with text prompt', async () => {
    const result = await auditInventory({
      inventory: [{ tag: 'hatsune_miku', count: 5, paths: [] }],
      triggerWords: ['hatsune miku'],
      requestLlm: async ({ prompt }) => {
        expect(prompt).toContain('hatsune miku')
        return [{ tag: 'hatsune_miku', type: 'keep' }]
      },
    })
    expect(result.decisions).toEqual([{ tag: 'hatsune_miku', type: 'keep' }])
  })
})

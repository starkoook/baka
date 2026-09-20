import { describe, expect, it } from 'vitest'
import { addTag, buildQueueInventory, buildQuickReplacePlan, ensureTriggerFirst, hasTag, removeTag, renameTag, tagsEqual } from '../queue-tags'

const queue = [
  { tags: [{ tag: '1girl' }, { tag: 'pink_hair' }, { tag: 'smile' }] },
  { tags: [{ tag: '1girl' }, { tag: 'pink hair' }] },
  { tags: [{ tag: 'smile' }, { tag: 'Smile' }] },
]

describe('queue tag helpers', () => {
  it('counts each tag once per image, treating underscores and case as the same tag', () => {
    const inventory = buildQueueInventory(queue)
    expect(inventory.map((entry) => [entry.tag, entry.count])).toEqual([['1girl', 2], ['pink_hair', 2], ['smile', 2]])
    expect(inventory[1].indexes).toEqual([0, 1])
  })

  it('renames, removes and adds without creating duplicates', () => {
    expect(renameTag(queue[0].tags, 'pink_hair', 'red hair').map((tag) => tag.tag)).toEqual(['1girl', 'red hair', 'smile'])
    expect(renameTag([{ tag: 'hat' }, { tag: 'white hat' }], 'hat', 'white hat').map((tag) => tag.tag)).toEqual(['white hat'])
    expect(renameTag(queue[0].tags, 'smile', 'smile ')).toEqual(queue[0].tags)
    expect(removeTag(queue[2].tags, 'smile')).toEqual([])
    expect(addTag(queue[0].tags, 'solo', 'first').map((tag) => tag.tag)).toEqual(['solo', '1girl', 'pink_hair', 'smile'])
    expect(addTag(queue[0].tags, '1GIRL')).toEqual(queue[0].tags)
    expect(hasTag(queue[1].tags, 'PINK_HAIR')).toBe(true)
  })

  it('plans quick replace by the last word of the canonical tag, below the threshold only', () => {
    const inventory = [
      { tag: 'black shoes', count: 40, indexes: [] },
      { tag: 'shoes', count: 12, indexes: [] },
      { tag: 'red_shoes', count: 3, indexes: [] },
      { tag: 'brown shoes', count: 30, indexes: [] },
      { tag: 'horseshoes', count: 1, indexes: [] },
      { tag: 'black hat', count: 2, indexes: [] },
    ]
    expect(buildQuickReplacePlan(inventory, 'black shoes', 20).map((row) => row.tag)).toEqual(['red_shoes', 'shoes'])
    expect(buildQuickReplacePlan(inventory, 'black shoes', 50).map((row) => row.tag)).toEqual(['red_shoes', 'shoes', 'brown shoes'])
    expect(buildQuickReplacePlan(inventory, '', 50)).toEqual([])
  })

  it('keeps the trigger word first', () => {
    expect(ensureTriggerFirst(queue[0].tags, 'miku').map((tag) => tag.tag)).toEqual(['miku', '1girl', 'pink_hair', 'smile'])
    expect(ensureTriggerFirst([{ tag: '1girl' }, { tag: 'miku', weight: 1.2 }], 'miku')).toEqual([{ tag: 'miku', weight: 1.2 }, { tag: '1girl' }])
    expect(ensureTriggerFirst(queue[0].tags, '  ')).toEqual(queue[0].tags)
    expect(tagsEqual(queue[0].tags, ensureTriggerFirst(queue[0].tags, ''))).toBe(true)
    expect(tagsEqual(queue[0].tags, ensureTriggerFirst(queue[0].tags, 'miku'))).toBe(false)
  })
})

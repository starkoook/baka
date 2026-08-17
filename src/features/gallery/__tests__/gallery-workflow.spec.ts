import { describe, expect, it } from 'vitest'
import { applyGallerySelection, createGalleryHandoff } from '../gallery-workflow'

describe('gallery workflow', () => {
  it('replaces selection on a normal click', () => {
    const result = applyGallerySelection(new Set([10, 20]), [10, 20, 30, 40], 30, 'single', 20)

    expect(result.selectedIds).toEqual(new Set([30]))
    expect(result.anchorId).toBe(30)
  })

  it('toggles one image without losing the rest of the selection', () => {
    const added = applyGallerySelection(new Set([10]), [10, 20, 30], 30, 'toggle', 10)
    const removed = applyGallerySelection(added.selectedIds, [10, 20, 30], 10, 'toggle', added.anchorId)

    expect(added.selectedIds).toEqual(new Set([10, 30]))
    expect(removed.selectedIds).toEqual(new Set([30]))
  })

  it('selects a contiguous range from the existing anchor', () => {
    const result = applyGallerySelection(new Set([10]), [10, 20, 30, 40], 30, 'range', 10)

    expect(result.selectedIds).toEqual(new Set([10, 20, 30]))
    expect(result.anchorId).toBe(10)
  })

  it('preserves image order and gallery location in an annotation handoff', () => {
    const handoff = createGalleryHandoff(
      [{ id: 2, path: 'B.png' }, { id: 1, path: 'A.png' }],
      {
        kind: 'root',
        id: 7,
        search: 'blue hair',
        tagState: 'untagged',
        sort: 'modified-desc',
        scrollTop: 640,
        selectedIds: [2, 1],
      },
    )

    expect(handoff.items.map((item) => item.id)).toEqual([2, 1])
    expect(handoff.returnContext).toMatchObject({
      kind: 'root',
      id: 7,
      search: 'blue hair',
      tagState: 'untagged',
      scrollTop: 640,
      selectedIds: [2, 1],
    })
  })
})

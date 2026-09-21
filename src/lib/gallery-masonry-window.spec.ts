import { describe, expect, it } from 'vitest'
import {
  LIST_GAP,
  LIST_ROW,
  MASONRY_GAP,
  MASONRY_ROW,
  layoutGalleryGrid,
  masonrySpan,
  nextObservedGridWidth,
  visibleGalleryItems,
} from './gallery-masonry-window'

function img(id: number, width: number, height: number) {
  return { id, width, height }
}

describe('gallery masonry window', () => {
  it('clamps extreme aspect ratios before converting them to grid spans', () => {
    expect(masonrySpan(1000, 1000, 200)).toBe(Math.max(6, Math.round((200 + MASONRY_GAP) / (MASONRY_ROW + MASONRY_GAP))))
    expect(masonrySpan(1000, 4000, 200)).toBe(masonrySpan(1000, 1600, 200))
    expect(masonrySpan(4000, 1000, 200)).toBe(masonrySpan(1000, 620, 200))
  })

  it('packs masonry items into the shortest column and reports total height', () => {
    const layout = layoutGalleryGrid(
      [img(1, 100, 100), img(2, 100, 100), img(3, 100, 160)],
      { columns: 2, columnWidth: 200, viewMode: 'small' },
    )

    expect(layout.items).toHaveLength(3)
    expect(layout.items[0]).toMatchObject({ index: 0, column: 0, left: 0, width: 200 })
    expect(layout.items[1]).toMatchObject({ index: 1, column: 1, left: 200 + MASONRY_GAP, top: 0 })
    expect(layout.items[2].column).toBe(0)
    expect(layout.items[2].top).toBe(layout.items[0].height + MASONRY_GAP)
    expect(layout.totalHeight).toBe(Math.max(...layout.items.map((item) => item.top + item.height)))
  })

  it('lays list mode out as a single column of fixed-height rows', () => {
    const layout = layoutGalleryGrid([img(1, 10, 10), img(2, 10, 10)], {
      columns: 4,
      columnWidth: 200,
      viewMode: 'list',
      gridWidth: 480,
    })

    expect(layout.items[0]).toMatchObject({ top: 0, left: 0, width: 480, height: LIST_ROW })
    expect(layout.items[1]).toMatchObject({ top: LIST_ROW + LIST_GAP, height: LIST_ROW })
    expect(layout.totalHeight).toBe(LIST_ROW * 2 + LIST_GAP)
  })

  it('only returns items that overlap the viewport plus overscan', () => {
    const layout = layoutGalleryGrid(
      Array.from({ length: 40 }, (_, id) => img(id + 1, 100, 100)),
      { columns: 1, columnWidth: 200, viewMode: 'list', gridWidth: 200 },
    )
    const row = LIST_ROW + LIST_GAP
    const visible = visibleGalleryItems(layout.items, 10 * row, 200, 0)

    expect(visible[0].index).toBe(10)
    expect(visible[visible.length - 1]?.index).toBeLessThan(20)
    expect(visible.every((item) => item.top < 10 * row + 200 && item.top + item.height > 10 * row)).toBe(true)
  })

  it('ignores sub-pixel scrollbar jitter so ResizeObserver cannot thrash the grid', () => {
    expect(nextObservedGridWidth(800, 801.4)).toBe(800)
    expect(nextObservedGridWidth(800, 784)).toBe(784)
    expect(nextObservedGridWidth(0, 1024.2)).toBe(1024)
    expect(nextObservedGridWidth(640, 0)).toBe(640)
  })
})

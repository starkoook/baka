export const MASONRY_ROW = 8
export const MASONRY_GAP = 14
export const LIST_ROW = 64
export const LIST_GAP = 6

export type GalleryViewMode = 'small' | 'large' | 'list'

export interface MasonryImage {
  width: number
  height: number
}

export interface MasonryItem<T> {
  image: T
  index: number
  column: number
  top: number
  left: number
  width: number
  height: number
}

export function masonrySpan(
  width: number,
  height: number,
  columnWidth: number,
  row = MASONRY_ROW,
  gap = MASONRY_GAP,
): number {
  if (columnWidth <= 0) return 6
  const ratio = width > 0 && height > 0 ? height / width : 1
  const clamped = Math.min(1.6, Math.max(0.62, ratio))
  const cardHeight = columnWidth * clamped
  return Math.max(6, Math.round((cardHeight + gap) / (row + gap)))
}

export function layoutGalleryGrid<T extends MasonryImage>(
  images: T[],
  options: {
    columns: number
    columnWidth: number
    viewMode?: GalleryViewMode
    gridWidth?: number
  },
): { items: MasonryItem<T>[]; totalHeight: number } {
  if (options.viewMode === 'list') {
    const width = Math.max(0, options.gridWidth || options.columnWidth)
    const items = images.map((image, index) => ({
      image,
      index,
      column: 0,
      top: index * (LIST_ROW + LIST_GAP),
      left: 0,
      width,
      height: LIST_ROW,
    }))
    const totalHeight = images.length === 0 ? 0 : images.length * LIST_ROW + (images.length - 1) * LIST_GAP
    return { items, totalHeight }
  }

  const columns = Math.max(1, options.columns)
  const columnWidth = Math.max(0, options.columnWidth)
  const heights = Array.from({ length: columns }, () => 0)
  const items = images.map((image, index) => {
    const span = masonrySpan(image.width, image.height, columnWidth)
    const height = span * (MASONRY_ROW + MASONRY_GAP) - MASONRY_GAP
    let column = 0
    for (let i = 1; i < heights.length; i++) {
      if (heights[i] < heights[column]) column = i
    }
    const top = heights[column]
    heights[column] += height + MASONRY_GAP
    return {
      image,
      index,
      column,
      top,
      left: column * (columnWidth + MASONRY_GAP),
      width: columnWidth,
      height,
    }
  })
  return { items, totalHeight: Math.max(0, ...heights.map((value) => value - MASONRY_GAP), 0) }
}

export function visibleGalleryItems<T>(
  items: MasonryItem<T>[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 640,
): MasonryItem<T>[] {
  const minY = scrollTop - overscan
  const maxY = scrollTop + viewportHeight + overscan
  return items.filter((item) => item.top < maxY && item.top + item.height > minY)
}

/** Ignore scrollbar/sub-pixel jitter so ResizeObserver cannot bounce column width. */
export function nextObservedGridWidth(current: number, observed: number, threshold = 2): number {
  if (!Number.isFinite(observed) || observed <= 0) return current
  if (Math.abs(observed - current) < threshold) return current
  return Math.round(observed)
}

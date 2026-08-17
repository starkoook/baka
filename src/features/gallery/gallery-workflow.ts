export type GallerySelectionMode = 'single' | 'toggle' | 'range'

export type GallerySource = {
  kind: 'root' | 'dataset' | 'all'
  id: number | string | null
}

export type GalleryReturnContext = GallerySource & {
  search: string
  tagState: 'all' | 'tagged' | 'untagged'
  sort: string
  scrollTop: number
  selectedIds: number[]
}

export type GalleryHandoffItem = {
  id: number
  path: string
  tags?: { tag: string; confidence?: number; source?: string; category?: string; weight?: number }[]
}

export type GalleryHandoff = {
  items: GalleryHandoffItem[]
  returnContext: GalleryReturnContext
}

export function applyGallerySelection(
  current: Set<number>,
  orderedIds: number[],
  targetId: number,
  mode: GallerySelectionMode,
  anchorId: number | null,
) {
  if (mode === 'single') {
    return { selectedIds: new Set([targetId]), anchorId: targetId }
  }

  if (mode === 'toggle') {
    const selectedIds = new Set(current)
    if (selectedIds.has(targetId)) selectedIds.delete(targetId)
    else selectedIds.add(targetId)
    return { selectedIds, anchorId: targetId }
  }

  const targetIndex = orderedIds.indexOf(targetId)
  const anchorIndex = orderedIds.indexOf(anchorId ?? targetId)
  if (targetIndex < 0 || anchorIndex < 0) {
    return { selectedIds: new Set([targetId]), anchorId: targetId }
  }

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return {
    selectedIds: new Set(orderedIds.slice(start, end + 1)),
    anchorId: anchorId ?? targetId,
  }
}

export function createGalleryHandoff(
  items: GalleryHandoffItem[],
  returnContext: GalleryReturnContext,
): GalleryHandoff {
  return {
    items: items.map((item) => ({ id: item.id, path: item.path, tags: item.tags ? [...item.tags] : undefined })),
    returnContext: {
      ...returnContext,
      selectedIds: [...returnContext.selectedIds],
    },
  }
}

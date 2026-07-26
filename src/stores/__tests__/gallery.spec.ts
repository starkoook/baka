import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGalleryStore } from '@/stores/gallery'
import type { GalleryReturnContext } from '@/features/gallery/gallery-workflow'

// 构造最小 GalleryImage（字段对齐 env.d.ts 全局类型）
function mockImage(id: number): GalleryImage {
  return {
    id,
    path: `/img/${id}.png`,
    filename: `${id}.png`,
    dirname: '/img',
    root_id: 1,
    width: 100,
    height: 100,
    file_size: 0,
    file_modified_at: '',
    indexed_at: '',
    thumb_hash: null,
  } as GalleryImage
}

describe('gallery store — 选择状态机', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('初始状态：无选中', () => {
    const s = useGalleryStore()
    expect(s.selectedCount).toBe(0)
    expect(s.selectedImages).toHaveLength(0)
  })

  it('单选 toggleSelect(id) 替换式选中', () => {
    const s = useGalleryStore()
    s.images = [mockImage(1), mockImage(2), mockImage(3)]

    s.toggleSelect(1)
    expect(s.selectedCount).toBe(1)
    expect(s.isSelected(1)).toBe(true)
    expect(s.isSelected(2)).toBe(false)
    expect(s.selectedImages.map((i) => i.id)).toEqual([1])

    // 单选另一张 → 上一张被替换掉
    s.toggleSelect(2)
    expect(s.selectedCount).toBe(1)
    expect(s.isSelected(1)).toBe(false)
    expect(s.isSelected(2)).toBe(true)
  })

  it('multi 模式 toggleSelect(id, true) 累加/移除', () => {
    const s = useGalleryStore()
    s.images = [mockImage(1), mockImage(2)]

    s.toggleSelect(1, true)
    s.toggleSelect(2, true)
    expect(s.selectedCount).toBe(2)

    // 再点已选的 → 移除
    s.toggleSelect(1, true)
    expect(s.selectedCount).toBe(1)
    expect(s.isSelected(1)).toBe(false)
    expect(s.isSelected(2)).toBe(true)
  })

  it('selectAll 选中全部；clearSelection 清空', () => {
    const s = useGalleryStore()
    s.images = [mockImage(1), mockImage(2), mockImage(3)]

    s.selectAll()
    expect(s.selectedCount).toBe(3)
    expect(s.selectedImages).toHaveLength(3)

    s.clearSelection()
    expect(s.selectedCount).toBe(0)
    expect(s.selectedImages).toHaveLength(0)
  })

  it('selectedImages 与 selectedIds 保持同步', () => {
    const s = useGalleryStore()
    s.images = [mockImage(10), mockImage(20), mockImage(30)]
    s.toggleSelect(10, true)
    s.toggleSelect(30, true)
    expect(s.selectedImages.map((i) => i.id).sort()).toEqual([10, 30])
  })

  it('selectRange selects every visible image between the anchor and target', () => {
    const s = useGalleryStore()
    s.images = [mockImage(10), mockImage(20), mockImage(30), mockImage(40)]

    s.toggleSelect(10)
    s.selectRange(30)

    expect(s.selectedImages.map((image) => image.id)).toEqual([10, 20, 30])
  })

  it('captures and restores source, filters, selection, and scroll position', () => {
    const s = useGalleryStore()
    s.activeRootId = 3
    s.searchQuery = 'blue hair'
    s.tagStateFilter = 'untagged'
    s.sortMode = 'modified-desc'
    s.selectedIds = new Set([10, 30])

    const context = s.captureReturnContext(480)
    s.searchQuery = ''
    s.clearSelection()
    s.restoreReturnContext(context)

    expect(context).toMatchObject({ kind: 'root', id: 3, scrollTop: 480 })
    expect(s.searchQuery).toBe('blue hair')
    expect(s.tagStateFilter).toBe('untagged')
    expect(s.sortMode).toBe('modified-desc')
    expect(s.selectedIds).toEqual(new Set([10, 30]))
    expect(s.pendingScrollTop).toBe(480)
  })

  it.each([
    [{ kind: 'all', id: null }, null, null],
    [{ kind: 'root', id: 7 }, 7, null],
    [{ kind: 'dataset', id: 'D:\\sets\\a' }, null, 'D:\\sets\\a'],
  ] as [Pick<GalleryReturnContext, 'kind' | 'id'>, number | null, string | null][])(
    'restores the %s source without leaving another source active',
    (source, rootId, datasetId) => {
      const s = useGalleryStore()
      s.activeRootId = 99
      s.activeDatasetId = 'D:\\old-set'

      s.restoreReturnContext({
        ...source,
        search: 'blue',
        tagState: 'untagged',
        sort: 'name-asc',
        scrollTop: 120,
        selectedIds: [1],
      })

      expect(s.activeRootId).toBe(rootId)
      expect(s.activeDatasetId).toBe(datasetId)
    },
  )

  it('updates gallery and dataset references after files are moved', () => {
    const s = useGalleryStore()
    s.images = [mockImage(1), mockImage(2)]
    s.images[0].path = 'D:\\old\\A.png'
    s.datasets = [{ name: 'set', folderPath: 'D:\\set', addedAt: '', imagePaths: ['D:\\old\\A.png'] }]
    s.datasetImageItems = [{ path: 'D:\\old\\A.png', filename: 'A.png', caption: '', hasCaption: false }]

    s.replaceImagePaths([{ oldPath: 'D:\\old\\A.png', newPath: 'D:\\new\\A.png' }])

    expect(s.images[0].path).toBe('D:\\new\\A.png')
    expect(s.datasets[0].imagePaths).toEqual(['D:\\new\\A.png'])
    expect(s.datasetImageItems[0].path).toBe('D:\\new\\A.png')
  })
})

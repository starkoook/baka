import { describe, expect, it } from 'vitest'
import { getContinueAction, getDashboardSnapshot, type DashboardAction } from '../dashboard-summary'

describe('dashboard summary', () => {
  it('continues a trimmed active task before annotations and remembered workspace', () => {
    expect(getContinueAction({
      imageCount: 12,
      datasetCount: 2,
      unfinishedAnnotationCount: 4,
      activeTaskName: '  训练 my_lora  ',
      rememberedWorkspace: { label: '返回图库', route: '/gallery' },
    })).toEqual({ label: '继续 训练 my_lora', route: '/training/run' })
  })

  it('continues unfinished annotations before remembered workspace', () => {
    expect(getContinueAction({
      imageCount: 12,
      datasetCount: 2,
      unfinishedAnnotationCount: 4,
      activeTaskName: null,
      rememberedWorkspace: { label: '返回图库', route: '/gallery' },
    })).toEqual({ label: '继续标注 4 张素材', route: '/tagger' })
  })

  it('copies remembered workspace before the dataset fallback', () => {
    const rememberedWorkspace: DashboardAction = { label: '继续整理图库', route: '/gallery' }

    const action = getContinueAction({
      imageCount: 12,
      datasetCount: 2,
      unfinishedAnnotationCount: 0,
      activeTaskName: null,
      rememberedWorkspace,
    })

    expect(action).toEqual(rememberedWorkspace)
    expect(action).not.toBe(rememberedWorkspace)
  })

  it('sends prepared datasets to training when no workspace is remembered', () => {
    expect(getContinueAction({
      imageCount: 12,
      datasetCount: 2,
      unfinishedAnnotationCount: 0,
      activeTaskName: null,
      rememberedWorkspace: null,
    })).toEqual({ label: '继续准备训练', route: '/training' })
  })

  it('sends an empty workspace to the gallery', () => {
    expect(getContinueAction({
      imageCount: 0,
      datasetCount: 0,
      unfinishedAnnotationCount: 0,
      activeTaskName: null,
      rememberedWorkspace: null,
    })).toEqual({ label: '导入第一批素材', route: '/gallery' })
  })

  it('treats a blank task name as no active task', () => {
    expect(getContinueAction({
      imageCount: 12,
      datasetCount: 2,
      unfinishedAnnotationCount: 3,
      activeTaskName: '   ',
      rememberedWorkspace: null,
    })).toEqual({ label: '继续标注 3 张素材', route: '/tagger' })
  })

  it('builds the snapshot from real image, dataset, and annotation counts', () => {
    expect(getDashboardSnapshot({
      imageCount: 428,
      datasetCount: 3,
      unfinishedAnnotationCount: 17,
      activeTaskName: '训练 my_lora',
      rememberedWorkspace: { label: '继续训练', route: '/training/run' },
    })).toEqual([
      { label: '图库', value: '428 张', route: '/gallery' },
      { label: '数据集', value: '3 个', route: '/gallery' },
      { label: '标注', value: '17 张待处理', route: '/tagger' },
    ])
  })

  it('reports when there are no annotations to process', () => {
    expect(getDashboardSnapshot({
      imageCount: 0,
      datasetCount: 0,
      unfinishedAnnotationCount: 0,
      activeTaskName: null,
      rememberedWorkspace: null,
    })).toEqual([
      { label: '图库', value: '0 张', route: '/gallery' },
      { label: '数据集', value: '0 个', route: '/gallery' },
      { label: '标注', value: '没有待处理', route: '/tagger' },
    ])
  })
})

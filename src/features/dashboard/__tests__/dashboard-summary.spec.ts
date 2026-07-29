import { describe, expect, it } from 'vitest'
import { getContinueAction, getDashboardSnapshot } from '../dashboard-summary'

describe('dashboard summary', () => {
  it('continues the active task before choosing another workspace', () => {
    expect(getContinueAction({ datasetCount: 2, activeTaskName: '训练 my_lora' }))
      .toEqual({ label: '继续 训练 my_lora', route: '/training/run' })
  })

  it('sends prepared datasets to training', () => {
    expect(getContinueAction({ datasetCount: 2, activeTaskName: null }))
      .toEqual({ label: '继续准备训练', route: '/training' })
  })

  it('sends an empty workspace to the gallery', () => {
    expect(getContinueAction({ datasetCount: 0, activeTaskName: null }))
      .toEqual({ label: '导入第一批素材', route: '/gallery' })
  })

  it('builds a compact snapshot without inventing metrics', () => {
    expect(getDashboardSnapshot({ imageCount: 428, datasetCount: 3, activeTaskName: null }))
      .toEqual([
        { label: '图库', value: '428 张', route: '/gallery' },
        { label: '数据集', value: '3 个', route: '/gallery' },
        { label: '训练', value: '可以开始', route: '/training' },
      ])
  })
})

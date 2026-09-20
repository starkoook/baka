import { describe, expect, it } from 'vitest'
import {
  getAnnotationProgress,
  getContinueAction,
  getDashboardSnapshot,
  getGreeting,
  getHeroSubline,
  resolveDashboardRoute,
  type DashboardAction,
} from '../dashboard-summary'

describe('dashboard summary', () => {
  it('greets by hour of day', () => {
    expect(getGreeting(3)).toBe('夜深了')
    expect(getGreeting(8)).toBe('早上好')
    expect(getGreeting(12)).toBe('中午好')
    expect(getGreeting(17)).toBe('下午好')
    expect(getGreeting(22)).toBe('晚上好')
    expect(getGreeting(Number.NaN)).toBe('你好')
  })

  it('clamps annotation progress into a safe 0-100 range', () => {
    expect(getAnnotationProgress(248, 212)).toEqual({ total: 248, done: 212, remaining: 36, percent: 85 })
    expect(getAnnotationProgress(0, 0)).toEqual({ total: 0, done: 0, remaining: 0, percent: 0 })
    expect(getAnnotationProgress(10, 99)).toEqual({ total: 10, done: 10, remaining: 0, percent: 100 })
    expect(getAnnotationProgress(Number.NaN, -3)).toEqual({ total: 0, done: 0, remaining: 0, percent: 0 })
  })

  it('describes where the user left off in one line', () => {
    expect(getHeroSubline({
      imageCount: 1284,
      datasetCount: 6,
      unfinishedAnnotationCount: 36,
      activeTaskName: null,
      rememberedWorkspace: { label: '继续整理图库', route: '/gallery' },
    })).toBe('上次停在 整理图库 · 1284 张素材 · 36 张待标注 · 训练空闲')
    expect(getHeroSubline({
      imageCount: 0,
      datasetCount: 0,
      unfinishedAnnotationCount: 0,
      activeTaskName: 'lora_v3',
      rememberedWorkspace: null,
    })).toBe('0 张素材 · 没有待标注 · 训练进行中')
  })

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

  it('uses the preferred workspace route when the router has registered it', () => {
    expect(resolveDashboardRoute('/training/run', (route) => route === '/training/run')).toBe('/training/run')
    expect(resolveDashboardRoute('/tagger', (route) => route === '/tagger')).toBe('/tagger')
  })

  it('falls back to a registered parent workspace instead of navigating to an unmatched route', () => {
    const isRegistered = (route: string) => ['/training', '/gallery'].includes(route)

    expect(resolveDashboardRoute('/training/run', isRegistered)).toBe('/training')
    expect(resolveDashboardRoute('/tagger', isRegistered)).toBe('/gallery')
  })

  it('falls back to the dashboard for an unknown unmatched route', () => {
    expect(resolveDashboardRoute('/missing', (route) => route === '/')).toBe('/')
  })
})

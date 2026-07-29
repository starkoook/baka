export interface DashboardSummaryInput {
  imageCount: number
  datasetCount: number
  activeTaskName: string | null
}

export interface DashboardAction {
  label: string
  route: string
}

export function getContinueAction(
  input: Pick<DashboardSummaryInput, 'datasetCount' | 'activeTaskName'>,
): DashboardAction {
  if (input.activeTaskName) {
    return { label: `继续 ${input.activeTaskName}`, route: '/training/run' }
  }
  if (input.datasetCount > 0) {
    return { label: '继续准备训练', route: '/training' }
  }
  return { label: '导入第一批素材', route: '/gallery' }
}

export function getDashboardSnapshot(input: DashboardSummaryInput): Array<DashboardAction & { value: string }> {
  return [
    { label: '图库', value: `${input.imageCount} 张`, route: '/gallery' },
    { label: '数据集', value: `${input.datasetCount} 个`, route: '/gallery' },
    {
      label: '训练',
      value: input.activeTaskName ?? (input.datasetCount > 0 ? '可以开始' : '等待开始'),
      route: input.activeTaskName ? '/training/run' : '/training',
    },
  ]
}

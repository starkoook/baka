export interface DashboardAction {
  label: string
  route: string
}

export interface DashboardSummaryInput {
  imageCount: number
  datasetCount: number
  unfinishedAnnotationCount: number
  activeTaskName: string | null
  rememberedWorkspace: DashboardAction | null
}

const dashboardRouteFallbacks: Record<string, string> = {
  '/training/run': '/training',
  '/training/runtime': '/training',
  '/tagger': '/gallery',
}

export function resolveDashboardRoute(
  preferredRoute: string,
  isRegistered: (route: string) => boolean,
): string {
  if (isRegistered(preferredRoute)) return preferredRoute

  const fallbackRoute = dashboardRouteFallbacks[preferredRoute]
  if (fallbackRoute && isRegistered(fallbackRoute)) return fallbackRoute

  return '/'
}

function getActiveTaskName(name: string | null): string | null {
  return name?.trim() || null
}

export function getContinueAction(input: DashboardSummaryInput): DashboardAction {
  const activeTaskName = getActiveTaskName(input.activeTaskName)

  if (activeTaskName) {
    return { label: `继续 ${activeTaskName}`, route: '/training/run' }
  }
  if (input.unfinishedAnnotationCount > 0) {
    return { label: `继续标注 ${input.unfinishedAnnotationCount} 张素材`, route: '/tagger' }
  }
  if (input.rememberedWorkspace) {
    return { ...input.rememberedWorkspace }
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
      label: '标注',
      value: input.unfinishedAnnotationCount > 0
        ? `${input.unfinishedAnnotationCount} 张待处理`
        : '没有待处理',
      route: '/tagger',
    },
  ]
}

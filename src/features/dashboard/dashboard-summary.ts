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

/** 按小时给一句问候：凌晨 / 早上 / 中午 / 下午 / 晚上。 */
export function getGreeting(hour: number): string {
  if (!Number.isFinite(hour)) return '你好'
  const h = ((Math.floor(hour) % 24) + 24) % 24
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export interface AnnotationProgress {
  total: number
  done: number
  remaining: number
  percent: number
}

export function getAnnotationProgress(total: number, done: number): AnnotationProgress {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0))
  const safeDone = Math.min(safeTotal, Math.max(0, Math.floor(Number.isFinite(done) ? done : 0)))
  return {
    total: safeTotal,
    done: safeDone,
    remaining: safeTotal - safeDone,
    percent: safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0,
  }
}

/** 首页封面下面那句话：告诉用户上次停在哪、还有多少事。 */
export function getHeroSubline(input: DashboardSummaryInput): string {
  const parts: string[] = []
  if (input.rememberedWorkspace) parts.push(`上次停在 ${input.rememberedWorkspace.label.replace(/^(继续|返回)/, '')}`)
  parts.push(`${input.imageCount} 张素材`)
  parts.push(input.unfinishedAnnotationCount > 0 ? `${input.unfinishedAnnotationCount} 张待标注` : '没有待标注')
  parts.push(input.activeTaskName ? `训练进行中` : '训练空闲')
  return parts.join(' · ')
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

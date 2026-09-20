const STORAGE_KEY = 'baka-last-workspace-v1'

const WORKSPACE_LABELS = {
  '/gallery': '继续整理图库',
  '/booru-gallery': '继续浏览在线图库',
  '/tagger': '返回标注工作区',
  '/training': '继续配置训练',
  '/training/runtime': '继续配置训练环境',
  '/workbench': '继续工作台',
  '/video': '继续视频工具',
  '/image-tools': '继续图像工具',
  '/reverse': '继续提示词反推',
  '/upscale': '继续超分放大',
  '/generate': '继续 AI 生成',
  '/console': '返回控制台',
} as const

const WORKSPACE_SHORT_LABELS = {
  '/gallery': '图库',
  '/booru-gallery': '在线图库',
  '/tagger': '标注',
  '/training': '训练',
  '/training/runtime': '训练运行时',
  '/workbench': '工作台',
  '/video': '视频工具',
  '/image-tools': '图像工具',
  '/reverse': '反推',
  '/upscale': '放大',
  '/generate': '生成',
  '/console': '控制台',
} as const

type WorkspaceRoute = keyof typeof WORKSPACE_LABELS

const WORKSPACE_ALIASES: Record<string, WorkspaceRoute> = {
  '/training/run': '/training',
  '/video/convert': '/video',
  '/video/extract': '/video',
}

export interface StorageReaderWriter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface RememberedWorkspace {
  route: WorkspaceRoute
  label: (typeof WORKSPACE_LABELS)[WorkspaceRoute]
  shortLabel: (typeof WORKSPACE_SHORT_LABELS)[WorkspaceRoute]
}

export function normalizeWorkspaceRoute(routePath: string | null): WorkspaceRoute | null {
  const normalizedRoute = routePath !== null && Object.prototype.hasOwnProperty.call(WORKSPACE_ALIASES, routePath)
    ? WORKSPACE_ALIASES[routePath]
    : routePath

  return normalizedRoute !== null && Object.prototype.hasOwnProperty.call(WORKSPACE_LABELS, normalizedRoute)
    ? normalizedRoute as WorkspaceRoute
    : null
}

export function getRememberedWorkspace(routePath: string | null): RememberedWorkspace | null {
  const route = normalizeWorkspaceRoute(routePath)

  return route
    ? { route, label: WORKSPACE_LABELS[route], shortLabel: WORKSPACE_SHORT_LABELS[route] }
    : null
}

export function loadLastWorkspace(
  storage?: StorageReaderWriter,
): WorkspaceRoute | null {
  try {
    return normalizeWorkspaceRoute((storage ?? window.localStorage).getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

const RECENT_KEY = 'baka-recent-workspaces-v1'
export const RECENT_WORKSPACE_LIMIT = 3

function readRecentRoutes(storage: StorageReaderWriter): WorkspaceRoute[] {
  try {
    const raw = storage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const routes: WorkspaceRoute[] = []
    for (const value of parsed) {
      const route = normalizeWorkspaceRoute(typeof value === 'string' ? value : null)
      if (route && !routes.includes(route)) routes.push(route)
    }
    return routes.slice(0, RECENT_WORKSPACE_LIMIT)
  } catch {
    return []
  }
}

/** 最近打开过的工作区（最新在前，去重，最多 3 个）。 */
export function loadRecentWorkspaces(
  storage?: StorageReaderWriter,
): RememberedWorkspace[] {
  try {
    return readRecentRoutes(storage ?? window.localStorage)
      .map((route) => getRememberedWorkspace(route))
      .filter((workspace): workspace is RememberedWorkspace => workspace !== null)
  } catch {
    return []
  }
}

export function saveLastWorkspace(
  routePath: string,
  storage?: StorageReaderWriter,
): void {
  const route = normalizeWorkspaceRoute(routePath)

  if (route) {
    try {
      const target = storage ?? window.localStorage
      target.setItem(STORAGE_KEY, route)
      const recent = [route, ...readRecentRoutes(target).filter((existing) => existing !== route)]
      target.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, RECENT_WORKSPACE_LIMIT)))
    } catch {
      // Workspace history is optional and must never interrupt navigation.
    }
  }
}

export function getSettingsReturnTarget(
  storage?: StorageReaderWriter,
): RememberedWorkspace | null {
  return getRememberedWorkspace(loadLastWorkspace(storage))
}

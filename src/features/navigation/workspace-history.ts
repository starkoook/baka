const STORAGE_KEY = 'baka-last-workspace-v1'

const WORKSPACE_LABELS = {
  '/gallery': '继续整理图库',
  '/tagger': '返回标注工作区',
  '/training': '继续配置训练',
  '/training/runtime': '继续配置训练环境',
  '/reverse': '继续提示词反推',
  '/upscale': '继续超分放大',
  '/generate': '继续 AI 生成',
  '/console': '返回控制台',
} as const

type WorkspaceRoute = keyof typeof WORKSPACE_LABELS

export interface StorageReaderWriter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface RememberedWorkspace {
  route: WorkspaceRoute
  label: (typeof WORKSPACE_LABELS)[WorkspaceRoute]
}

export function normalizeWorkspaceRoute(routePath: string | null): WorkspaceRoute | null {
  const normalizedRoute = routePath === '/training/run' ? '/training' : routePath

  return normalizedRoute !== null && Object.prototype.hasOwnProperty.call(WORKSPACE_LABELS, normalizedRoute)
    ? normalizedRoute as WorkspaceRoute
    : null
}

export function getRememberedWorkspace(routePath: string | null): RememberedWorkspace | null {
  const route = normalizeWorkspaceRoute(routePath)

  return route ? { route, label: WORKSPACE_LABELS[route] } : null
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

export function saveLastWorkspace(
  routePath: string,
  storage?: StorageReaderWriter,
): void {
  const route = normalizeWorkspaceRoute(routePath)

  if (route) {
    try {
      (storage ?? window.localStorage).setItem(STORAGE_KEY, route)
    } catch {
      // Workspace history is optional and must never interrupt navigation.
    }
  }
}

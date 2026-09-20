export type AppNavigationId = 'home' | 'gallery' | 'tagger' | 'training' | 'tools' | 'settings' | 'console'

export interface AppNavigationChild {
  readonly label: string
  readonly route: string
}

export interface AppNavigationItem {
  readonly id: AppNavigationId
  readonly label: string
  readonly route: string
  readonly matches: readonly string[]
  readonly children?: readonly AppNavigationChild[]
}

/** 侧栏主入口：只有首页。工具全部通过"工具选择"进入。 */
export const APP_NAVIGATION: readonly AppNavigationItem[] = [
  { id: 'home', label: '首页', route: '/', matches: ['/'] },
]

/** 侧栏底部的辅助入口。 */
export const APP_UTILITY_NAVIGATION: readonly AppNavigationItem[] = [
  { id: 'console', label: '控制台', route: '/console', matches: ['/console'] },
  { id: 'settings', label: '设置', route: '/settings', matches: ['/settings'] },
]

export function isNavigationItemActive(item: AppNavigationItem, routePath: string): boolean {
  if (item.id === 'home') return routePath === '/'
  return item.matches.some((prefix) => routePath === prefix || routePath.startsWith(prefix + '/'))
}

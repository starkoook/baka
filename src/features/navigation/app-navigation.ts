export type AppNavigationId = 'home' | 'gallery' | 'tagger' | 'training' | 'tools' | 'settings'

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

export const APP_NAVIGATION: readonly AppNavigationItem[] = [
  { id: 'home', label: '主页', route: '/', matches: ['/'] },
]

export function isNavigationItemActive(item: AppNavigationItem, routePath: string): boolean {
  if (item.id === 'home') return routePath === '/'

  return item.matches.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))
}

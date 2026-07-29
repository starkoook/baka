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
  { id: 'gallery', label: '图库', route: '/gallery', matches: ['/gallery'] },
  { id: 'tagger', label: '标注', route: '/tagger', matches: ['/tagger'] },
  { id: 'training', label: '训练', route: '/training', matches: ['/training'] },
  {
    id: 'tools',
    label: '工具',
    route: '/reverse',
    matches: ['/reverse', '/upscale', '/generate', '/console'],
    children: [
      { label: '超分放大', route: '/upscale' },
      { label: '提示词反推', route: '/reverse' },
      { label: 'AI 生成', route: '/generate' },
      { label: '控制台', route: '/console' },
    ],
  },
  { id: 'settings', label: '设置', route: '/settings', matches: ['/settings'] },
]

export function isNavigationItemActive(item: AppNavigationItem, routePath: string): boolean {
  if (item.id === 'home') return routePath === '/'

  return item.matches.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))
}

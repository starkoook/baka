import { describe, expect, it } from 'vitest'
import { APP_NAVIGATION, APP_UTILITY_NAVIGATION, isNavigationItemActive, type AppNavigationItem } from '../app-navigation'

if (false) {
  const firstItem = APP_NAVIGATION[0] as AppNavigationItem

  // @ts-expect-error Navigation items cannot be changed by consumers.
  firstItem.route = '/other'
  // @ts-expect-error Navigation matches cannot be changed by consumers.
  firstItem.matches.push('/other')
  // @ts-expect-error Navigation children cannot be changed by consumers.
  firstItem.children.push({ label: 'Other', route: '/other' })
  // @ts-expect-error Navigation collection cannot be changed by consumers.
  APP_NAVIGATION.push(firstItem)
}

describe('application navigation', () => {
  it('keeps home as the only primary entry; tools go through the tool picker', () => {
    expect(APP_NAVIGATION.map((item) => item.label)).toEqual(['首页'])
    expect(APP_UTILITY_NAVIGATION.map((item) => item.label)).toEqual(['控制台', '设置'])
  })

  it('keeps home active only at the root route', () => {
    const home = APP_NAVIGATION.find((item) => item.id === 'home')!

    expect(isNavigationItemActive(home, '/')).toBe(true)
    expect(isNavigationItemActive(home, '/gallery')).toBe(false)
  })

  it('marks utility entries active on their own routes only', () => {
    const [console, settings] = APP_UTILITY_NAVIGATION
    expect(isNavigationItemActive(console, '/console')).toBe(true)
    expect(isNavigationItemActive(settings, '/settings')).toBe(true)
    expect(isNavigationItemActive(settings, '/')).toBe(false)
  })
})

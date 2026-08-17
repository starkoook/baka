import { describe, expect, it } from 'vitest'
import { APP_NAVIGATION, isNavigationItemActive, type AppNavigationItem } from '../app-navigation'

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
  it('defines the application navigation labels in order', () => {
    expect(APP_NAVIGATION.map((item) => item.label)).toEqual([
      '主页',
    ])
  })

  it('keeps home active only at the root route', () => {
    const home = APP_NAVIGATION.find((item) => item.id === 'home')!

    expect(isNavigationItemActive(home, '/')).toBe(true)
    expect(isNavigationItemActive(home, '/gallery')).toBe(false)
  })
})

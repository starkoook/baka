import { describe, expect, it } from 'vitest'
import { APP_NAVIGATION, isNavigationItemActive, type AppNavigationItem } from '../app-navigation'

if (false) {
  const firstItem = APP_NAVIGATION[0] as AppNavigationItem

  // @ts-expect-error Navigation items cannot be changed by consumers.
  firstItem.route = '/other'
  // @ts-expect-error Navigation matches cannot be changed by consumers.
  firstItem.matches.push('/other')
  // @ts-expect-error Navigation collection cannot be changed by consumers.
  APP_NAVIGATION.push(firstItem)
}

describe('application navigation', () => {
  it('defines the six application navigation labels in order', () => {
    expect(APP_NAVIGATION.map((item) => item.label)).toEqual([
      '主页',
      '图库',
      '标注',
      '训练',
      '工具',
      '设置',
    ])
  })

  it('keeps training active for its nested routes only', () => {
    const training = APP_NAVIGATION.find((item) => item.id === 'training')!

    expect(isNavigationItemActive(training, '/training')).toBe(true)
    expect(isNavigationItemActive(training, '/training/runtime')).toBe(true)
    expect(isNavigationItemActive(training, '/training/run')).toBe(true)
    expect(isNavigationItemActive(training, '/gallery')).toBe(false)
    expect(isNavigationItemActive(training, '/training-old')).toBe(false)
  })

  it('keeps home active only at the root route', () => {
    const home = APP_NAVIGATION.find((item) => item.id === 'home')!

    expect(isNavigationItemActive(home, '/')).toBe(true)
    expect(isNavigationItemActive(home, '/gallery')).toBe(false)
  })

  it('keeps all tool routes active without matching training', () => {
    const tools = APP_NAVIGATION.find((item) => item.id === 'tools')!

    expect(isNavigationItemActive(tools, '/reverse')).toBe(true)
    expect(isNavigationItemActive(tools, '/upscale')).toBe(true)
    expect(isNavigationItemActive(tools, '/generate')).toBe(true)
    expect(isNavigationItemActive(tools, '/console')).toBe(true)
    expect(isNavigationItemActive(tools, '/training')).toBe(false)
    expect(isNavigationItemActive(tools, '/reverse-engineering')).toBe(false)
  })
})

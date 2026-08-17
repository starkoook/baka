import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('dashboard visual acceptance', () => {
  it('uses an offline modern sans-serif font stack', () => {
    const globalStyles = read('src/styles/global.css')
    const variables = read('src/styles/variables.css')

    expect(globalStyles).not.toContain('fonts.googleapis.com')
    expect(`${globalStyles}\n${variables}`).not.toContain('ZCOOL')
    expect(variables).toMatch(
      /--font-sans:\s*'?(?:Inter|Segoe UI)'?.*'PingFang SC'.*'Microsoft YaHei'.*sans-serif/,
    )
  })

  it('keeps the sidebar to home navigation plus the tool picker', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')

    expect(sidebar).toContain('APP_NAVIGATION')
    expect(sidebar).toContain('aria-label="工具选择"')
    expect(sidebar).toContain('appStore.toggleToolPicker()')
    expect(sidebar).not.toContain('tool-subnav')
    expect(sidebar).not.toContain('isToolsExpanded')
    expect(sidebar).not.toContain('watch(')
  })

  it('positions an active navigation rail from the current route with a safe fallback', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')
    const rail = sidebar.indexOf('<span class="sidebar-active-rail"')
    const navigationLoop = sidebar.indexOf('<div v-for="item in APP_NAVIGATION"')

    expect(sidebar).toMatch(/const activeNavigationIndex = computed\(\(\) => \{[\s\S]*APP_NAVIGATION\.findIndex\(\(item\) => isNavigationItemActive\(item, route\.path\)\)[\s\S]*return index >= 0 \? index : 0[\s\S]*\}\)/)
    expect(sidebar).toMatch(/const activeRailStyle = computed\(\(\) => \(\{[\s\S]*'--active-navigation-index': String\(activeNavigationIndex\.value\),[\s\S]*\}\)\)/)
    expect(rail).toBeGreaterThan(-1)
    expect(rail).toBeLessThan(navigationLoop)
    expect(sidebar).toMatch(/<nav[\s\S]*class="sidebar-nav"[\s\S]*:style="activeRailStyle"/)
    expect(sidebar).toMatch(/<span\s+class="sidebar-active-rail"\s+aria-hidden="true"\s*><\/span>/)
  })

  it('keeps sidebar entries simple without disclosure branches', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')

    expect(sidebar).not.toContain('item.children')
    expect(sidebar).not.toContain('aria-expanded="item.children')
    expect(sidebar).not.toContain('#tools-subnavigation')
  })

  it('keeps the sidebar borderless', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')
    const appSidebarRule = sidebar.match(/\.app-sidebar\s*\{([^}]*)\}/s)?.[1] ?? ''
    const sidebarNavRule = sidebar.match(/\.sidebar-nav\s*\{([^}]*)\}/s)?.[1] ?? ''
    const sidebarFooterRule = sidebar.match(/\.sidebar-footer\s*\{([^}]*)\}/s)?.[1] ?? ''
    const borderValues = [...sidebar.matchAll(/\bborder:\s*([^;]+);/g)].map((match) => match[1].trim())

    for (const rule of [appSidebarRule, sidebarNavRule, sidebarFooterRule]) {
      expect(rule).toMatch(/\bborder:\s*0;/)
    }
    expect(sidebar).not.toMatch(/\bborder-(?:right|top|left)\s*:/)
    expect(borderValues.length).toBeGreaterThan(0)
    expect(borderValues.every((value) => value === '0')).toBe(true)
  })

  it('wires live dashboard state through the summary helpers', () => {
    const dashboard = read('src/views/Dashboard.vue')

    expect(dashboard).toContain('const summaryInput = computed(() => ({')
    expect(dashboard).toContain('galleryStore.roots.reduce')
    expect(dashboard).toContain('taggerStore.queue.filter')
    expect(dashboard).toContain("item.status !== 'reviewed'")
    expect(dashboard).toContain('getContinueAction(summaryInput.value)')
    expect(dashboard).toContain('getDashboardSnapshot(summaryInput.value)')
  })
})

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

  it('keeps the compact tools flyout closed outside tool routes', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')

    expect(sidebar).toContain('function isToolsRoute(path: string)')
    expect(sidebar).toContain('const isToolsExpanded = ref(isToolsRoute(route.path))')
    expect(sidebar).not.toContain('const isToolsExpanded = ref(true)')
  })

  it('synchronizes the tools flyout when navigation changes routes', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')

    expect(sidebar).toContain("import { computed, ref, watch } from 'vue'")
    expect(sidebar).toMatch(/watch\(\s*\(\) => route\.path,\s*\(path\) =>/)
    expect(sidebar).toContain('isToolsExpanded.value = isToolsRoute(path)')
  })

  it('positions an active navigation rail from the current route with a safe fallback', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')
    const rail = sidebar.indexOf('<span class="sidebar-active-rail"')
    const navigationLoop = sidebar.indexOf('<div v-for="item in APP_NAVIGATION"')

    expect(sidebar).toMatch(/const activeNavigationIndex = computed\(\(\) => \{[\s\S]*APP_NAVIGATION\.findIndex\(\(item\) => isNavigationItemActive\(item, route\.path\)\)[\s\S]*return index >= 0 \? index : 0[\s\S]*\}\)/)
    expect(sidebar).toMatch(/const activeRailStyle = computed\(\(\) => \(\{[\s\S]*'--active-navigation-index': String\(activeNavigationIndex\.value\),[\s\S]*\.\.\.sidebarLayoutStyle,[\s\S]*\}\)\)/)
    expect(rail).toBeGreaterThan(-1)
    expect(rail).toBeLessThan(navigationLoop)
    expect(sidebar).toMatch(/<nav[\s\S]*class="sidebar-nav"[\s\S]*:style="activeRailStyle"/)
    expect(sidebar).toMatch(/<span\s+class="sidebar-active-rail"\s+aria-hidden="true"\s*><\/span>/)
  })

  it('accounts for expanded tool rows when the active route follows tools', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')

    expect(sidebar).toMatch(/const toolsItem = APP_NAVIGATION\.find\(\(item\) => item\.id === 'tools'\)/)
    expect(sidebar).toMatch(/function isToolsRoute\(path: string\) \{\s*return toolsItem \? isNavigationItemActive\(toolsItem, path\) : false\s*\}/)
    expect(sidebar).toMatch(/const toolsIndex = toolsItem \? APP_NAVIGATION\.indexOf\(toolsItem\) : -1/)
    expect(sidebar).toContain("from './sidebar-layout'")
    expect(sidebar).toMatch(/const toolSubnavChildCount = toolsItem\?\.children\?\.length \?\? 0/)
    expect(sidebar).toMatch(/const \{ flowOffset: toolSubnavFlowOffset, style: sidebarLayoutStyle \} = createSidebarLayout\(toolSubnavChildCount\)/)
    expect(sidebar).toMatch(/toolSubnavFlowOffset > 0\s*&&\s*isToolsExpanded\.value/)
    expect(sidebar).toMatch(/const activeRailAfterExpandedTools = computed\(\s*\(\) =>\s*toolSubnavFlowOffset > 0\s*&&\s*isToolsExpanded\.value\s*&&\s*toolsIndex >= 0\s*&&\s*activeNavigationIndex\.value > toolsIndex,?\s*\)/)
    expect(sidebar).toMatch(/<nav\s+class="sidebar-nav"\s+:style="activeRailStyle"\s+:class="\{ 'tools-expanded': isToolsExpanded, 'active-after-tools': activeRailAfterExpandedTools \}"/)
  })

  it('uses non-empty child arrays for every tools disclosure branch', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')

    expect(sidebar.match(/item\.children\?\.length/g)).toHaveLength(4)
    expect(sidebar).toContain(":aria-expanded=\"item.children?.length ? isToolsExpanded : undefined\"")
    expect(sidebar).toContain(":aria-controls=\"item.children?.length ? 'tools-subnavigation' : undefined\"")
    expect(sidebar).toContain("@click=\"item.children?.length ? toggleTools() : navigateTo(item.route)\"")
    expect(sidebar).toContain('v-if="item.children?.length && isToolsExpanded"')
    expect(sidebar).not.toContain('item.children ?')
  })

  it('keeps the sidebar and compact tools flyout borderless while retaining flyout depth', () => {
    const sidebar = read('src/components/sidebar/AppSidebar.vue')
    const compactMedia = sidebar.slice(sidebar.indexOf('@media (max-width: 1200px)'))
    const appSidebarRule = sidebar.match(/\.app-sidebar\s*\{([^}]*)\}/s)?.[1] ?? ''
    const sidebarNavRule = sidebar.match(/\.sidebar-nav\s*\{([^}]*)\}/s)?.[1] ?? ''
    const toolSubnavRule = sidebar.match(/\.tool-subnav\s*\{([^}]*)\}/s)?.[1] ?? ''
    const sidebarFooterRule = sidebar.match(/\.sidebar-footer\s*\{([^}]*)\}/s)?.[1] ?? ''
    const compactToolSubnavRule = compactMedia.match(/\.tool-subnav\s*\{([^}]*)\}/s)?.[1] ?? ''
    const borderValues = [...sidebar.matchAll(/\bborder:\s*([^;]+);/g)].map((match) => match[1].trim())

    for (const rule of [appSidebarRule, sidebarNavRule, toolSubnavRule, sidebarFooterRule, compactToolSubnavRule]) {
      expect(rule).toMatch(/\bborder:\s*0;/)
    }
    expect(sidebar).not.toMatch(/\bborder-(?:right|top|left)\s*:/)
    expect(borderValues.length).toBeGreaterThan(0)
    expect(borderValues.every((value) => value === '0')).toBe(true)
    expect(compactMedia).toMatch(/\.tool-subnav\s*\{[^}]*box-shadow:\s*var\(--surface-shadow\);/s)
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

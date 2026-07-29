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
})

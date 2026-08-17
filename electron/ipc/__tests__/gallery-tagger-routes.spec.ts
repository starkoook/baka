import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('gallery and annotation routes', () => {
  it('routes gallery and annotation to separate page components', () => {
    const router = read('src/router/index.ts')

    expect(router).toContain("path: '/gallery'")
    expect(router).toContain("import('@/views/Gallery.vue')")
    expect(router).toContain("path: '/tagger'")
    expect(router).toContain("import('@/views/Tagger.vue')")
    expect(router).not.toContain("component: () => import('@/views/TaggerV2.vue')")
  })

  it('offers gallery and annotation through the tool picker', () => {
    const picker = read('src/components/sidebar/ToolPicker.vue')

    expect(picker).toContain("key: 'gallery'")
    expect(picker).toContain("route: '/gallery'")
    expect(picker).toContain("key: 'tagger'")
    expect(picker).toContain("route: '/tagger'")
  })

  it('exposes every tool route through the tool picker', () => {
    const picker = read('src/components/sidebar/ToolPicker.vue')

    for (const route of ['/gallery', '/tagger', '/training', '/upscale']) {
      expect(picker).toContain(`route: '${route}'`)
    }
    expect(picker).toContain('@mouseenter="activeTool = tool.key"')
    expect(picker).toContain('@click="enterTool(tool.route)"')
  })
})

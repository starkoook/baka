import { existsSync, readFileSync } from 'node:fs'
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

  it('exposes every tool route through the shared tool catalog used by the picker', () => {
    const catalog = read('src/features/tools/tool-catalog.ts')
    const router = read('src/router/index.ts')
    const picker = read('src/components/sidebar/ToolPicker.vue')

    for (const route of ['/gallery', '/booru-gallery', '/tagger', '/training', '/upscale', '/video', '/image-tools', '/console']) {
      expect(catalog).toContain(`route: '${route}'`)
      expect(router).toContain(`path: '${route}'`)
    }
    expect(picker).toContain("from '@/features/tools/tool-catalog'")
    expect(router).not.toContain("path: '/workbench'")
    expect(existsSync(resolve(process.cwd(), 'src/views/Workbench.vue'))).toBe(false)
  })
})

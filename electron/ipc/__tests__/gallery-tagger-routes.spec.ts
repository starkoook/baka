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

  it('shows gallery and annotation as independent top-level entries', () => {
    const navigation = read('src/features/navigation/app-navigation.ts')
    const sidebar = read('src/components/sidebar/AppSidebar.vue')

    expect(navigation).toContain("{ id: 'gallery', label: '图库', route: '/gallery'")
    expect(navigation).toContain("{ id: 'tagger', label: '标注', route: '/tagger'")
    expect(sidebar).toContain('APP_NAVIGATION')
    expect(sidebar).not.toContain('图库 & 标注')
  })
})

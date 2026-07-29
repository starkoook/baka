import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('character-led visual foundation', () => {
  it('uses a left application sidebar and no global HUD atmosphere', () => {
    const layout = read('src/layouts/MainLayout.vue')

    expect(layout).toContain("import AppSidebar from '@/components/sidebar/AppSidebar.vue'")
    expect(layout).not.toContain('TopMenuBar')
    expect(layout).not.toContain('scanlines')
    expect(layout).not.toContain('sakura-global')
    expect(layout).not.toContain('sparkles')
  })

  it('keeps character artwork on the dashboard only', () => {
    const dashboard = read('src/views/Dashboard.vue')

    expect(dashboard).toContain("import BrandHero from '@/components/dashboard/BrandHero.vue'")
    expect(read('src/views/Gallery.vue')).not.toContain('BrandHero')
    expect(read('src/views/Tagger.vue')).not.toContain('BrandHero')
    expect(read('src/views/TrainingTask.vue')).not.toContain('BrandHero')
  })

  it('retires the old horizontal menu and walking mascot', () => {
    expect(existsSync(resolve(process.cwd(), 'src/components/sidebar/TopMenuBar.vue'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'src/components/monitor/Mascot.vue'))).toBe(false)
  })

  it('keeps reduced-motion support in the shell and hero', () => {
    expect(read('src/layouts/MainLayout.vue')).toContain('prefers-reduced-motion: reduce')
    expect(read('src/components/dashboard/BrandHero.vue')).toContain('prefers-reduced-motion: reduce')
  })
})

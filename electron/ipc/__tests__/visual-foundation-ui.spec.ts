import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('character-led visual foundation', () => {
  it('uses a left application sidebar and no global HUD atmosphere', () => {
    const layout = read('src/layouts/MainLayout.vue')

    expect(layout).toContain("import AppSidebar from '@/components/sidebar/AppSidebar.vue'")
    expect(layout).toContain('<AppSidebar')

    for (const forbiddenPattern of [
      'TopMenuBar',
      'scanlines',
      'sakura-global',
      'sparkles',
      'bg-grid',
      'ambient-glow',
      'core-glow',
      'noise-layer',
      'vignette',
    ]) {
      expect(layout).not.toContain(forbiddenPattern)
    }
  })

  it('keeps the brand hero and recent-work components on the dashboard', () => {
    const dashboard = read('src/views/Dashboard.vue')

    expect(dashboard).toContain("import BrandHero from '@/components/dashboard/BrandHero.vue'")
    expect(dashboard).toContain("import DashboardRecentWork from '@/components/dashboard/DashboardRecentWork.vue'")
    expect(dashboard).toContain('<BrandHero')
    expect(dashboard).toContain('<DashboardRecentWork')
  })

  it('keeps character artwork on the dashboard only', () => {
    const viewsDirectory = resolve(process.cwd(), 'src/views')
    const layout = read('src/layouts/MainLayout.vue')

    expect(layout).not.toContain('BrandHero')

    for (const viewFile of readdirSync(viewsDirectory)) {
      if (viewFile === 'Dashboard.vue' || !viewFile.endsWith('.vue')) continue

      const viewPath = `src/views/${viewFile}`
      expect(read(viewPath), `${viewPath} must not contain BrandHero`).not.toContain('BrandHero')
    }
  })

  it('keeps the title and status chrome neutral', () => {
    const titleBar = read('src/components/titlebar/TitleBar.vue')
    const statusBar = read('src/components/statusbar/StatusBar.vue')

    for (const forbiddenPattern of ['text-gradient', 'titlebar-dots', 'Top accent glow line']) {
      expect(titleBar).not.toContain(forbiddenPattern)
    }

    for (const forbiddenPattern of ['pulse-glow', 'statusbar::after', 'Bottom accent dot']) {
      expect(statusBar).not.toContain(forbiddenPattern)
    }
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

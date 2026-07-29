import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboard = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf8')
const gallery = readFileSync(resolve(process.cwd(), 'src/views/TaggerV2.vue'), 'utf8')
const layout = readFileSync(resolve(process.cwd(), 'src/layouts/MainLayout.vue'), 'utf8')

describe('stable workbench UI', () => {
  it('uses the approved character-led dashboard instead of a tutorial workflow', () => {
    expect(dashboard).toContain("import BrandHero from '@/components/dashboard/BrandHero.vue'")
    expect(dashboard).toContain("import DashboardRecentWork from '@/components/dashboard/DashboardRecentWork.vue'")
    expect(dashboard).not.toContain('workflow-grid')
    expect(dashboard).not.toContain('cabin-label')
  })

  it('keeps a visible inspector beside the gallery', () => {
    expect(gallery).toContain('browse-inspector')
    expect(gallery).toContain('发送到反推')
  })

  it('provides a reduced-motion fallback for ambient effects', () => {
    expect(layout).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

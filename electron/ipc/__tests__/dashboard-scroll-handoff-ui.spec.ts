import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('dashboard scroll handoff UI', () => {
  it('connects the dashboard to scroll progress and exposes the handoff variables', () => {
    const dashboard = read('src/views/Dashboard.vue')

    expect(dashboard).toContain("import { computed, onMounted, ref } from 'vue'")
    expect(dashboard).toContain('useDashboardScrollHandoff')
    expect(dashboard).toContain('const dashboardPage = ref<HTMLElement | null>(null)')
    expect(dashboard).toContain('useDashboardScrollHandoff(dashboardPage)')
    expect(dashboard).toContain('const handoffStyle = computed(() => ({')
    expect(dashboard).toContain("'--handoff-progress': handoffProgress.value")
    expect(dashboard).toContain("'--hero-shift': `${-32 * handoffProgress.value}px`")
    expect(dashboard).toContain("'--hero-scale': 1 - 0.05 * handoffProgress.value")
    expect(dashboard).toContain("'--hero-opacity': 1 - 0.14 * handoffProgress.value")
    expect(dashboard).toContain("'--hero-saturation': 1 - 0.12 * handoffProgress.value")
    expect(dashboard).toContain("'--ambient-opacity': 0.08 + 0.12 * handoffProgress.value")
    expect(dashboard).toContain("'--workspace-shift': `${48 - 68 * handoffProgress.value}px`")
    expect(dashboard).toContain("'--workspace-scale': 0.96 + 0.04 * handoffProgress.value")
    expect(dashboard).toContain('<main ref="dashboardPage" class="dashboard-page" :style="handoffStyle">')
  })

  it('layers ambient light, the sticky hero, the workspace, and a scroll tail', () => {
    const dashboard = read('src/views/Dashboard.vue')

    expect(dashboard).toContain('class="dashboard-ambient" aria-hidden="true"')
    expect(dashboard).toContain('class="dashboard-hero-layer"')
    expect(dashboard).toContain('class="dashboard-workspace-layer"')
    expect(dashboard).toContain('class="dashboard-scroll-tail" aria-hidden="true"')
    expect(dashboard).toMatch(/\.dashboard-page\s*\{[^}]*position:\s*relative;[^}]*width:\s*min\(100%,\s*1400px\);[^}]*min-height:\s*calc\(100vh \+ 240px\);[^}]*perspective:\s*1200px;/s)
    expect(dashboard).toMatch(/\.dashboard-ambient\s*\{[^}]*pointer-events:\s*none;[^}]*opacity:\s*var\(--ambient-opacity\);/s)
    expect(dashboard).toMatch(/\.dashboard-hero-layer\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*1;[^}]*top:\s*0;[^}]*opacity:\s*var\(--hero-opacity\);[^}]*translateY\(var\(--hero-shift\)\) scale\(var\(--hero-scale\)\);[^}]*saturate\(var\(--hero-saturation\)\);/s)
    expect(dashboard).toMatch(/\.dashboard-workspace-layer\s*\{[^}]*z-index:\s*3;[^}]*grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s+minmax\(300px,\s*0\.65fr\);[^}]*align-items:\s*start;[^}]*gap:\s*14px;[^}]*margin:\s*clamp\(-112px,\s*-10vh,\s*-78px\)[^;]*;[^}]*translateY\(var\(--workspace-shift\)\) scale\(var\(--workspace-scale\)\);/s)
    expect(dashboard).toContain('height: clamp(160px, 24vh, 240px)')
  })

  it('keeps the handoff responsive and all content reachable with reduced motion', () => {
    const dashboard = read('src/views/Dashboard.vue')
    const hero = read('src/components/dashboard/BrandHero.vue')

    expect(dashboard).toMatch(/@media \(max-width:\s*1160px\)[\s\S]*\.dashboard-workspace-layer\s*\{[^}]*grid-template-columns:\s*1fr;/s)
    expect(dashboard).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.dashboard-workspace-layer\s*\{[^}]*margin-inline:\s*10px;/s)
    expect(dashboard).toMatch(/@media \(max-height:\s*720px\)[\s\S]*\.dashboard-page\s*\{[^}]*min-height:\s*calc\(100vh \+ 190px\);[^}]*\}[\s\S]*\.dashboard-scroll-tail\s*\{[^}]*height:\s*150px;/s)
    expect(dashboard).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.dashboard-page\s*\{[^}]*min-height:\s*auto;[^}]*\}[\s\S]*\.dashboard-hero-layer,[\s\S]*\.dashboard-workspace-layer\s*\{[^}]*position:\s*relative;[^}]*opacity:\s*1;[^}]*filter:\s*none;[^}]*transform:\s*none;[^}]*transition:\s*none;[^}]*\}[\s\S]*\.dashboard-scroll-tail\s*\{[^}]*display:\s*none;/s)
    expect(hero).toContain('min-height: clamp(430px, 62vh, 620px)')
    expect(hero).toContain('max-height: none')
    expect(hero).toContain('border: 0')
    expect(hero).toMatch(/@media \(max-height:\s*720px\)[\s\S]*min-height:\s*400px;/s)
  })
})

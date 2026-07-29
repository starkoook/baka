import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('dashboard interaction layers', () => {
  it('connects the dashboard summary and continue action to live stores', () => {
    const dashboard = read('src/views/Dashboard.vue')

    expect(dashboard).toContain('getRememberedWorkspace')
    expect(dashboard).toContain('loadLastWorkspace')
    expect(dashboard).toContain('useTaggerStore')
    expect(dashboard).toContain('const taggerStore = useTaggerStore()')
    expect(dashboard).toContain('const rememberedWorkspace = getRememberedWorkspace(loadLastWorkspace())')
    expect(dashboard).not.toContain('const unfinishedAnnotationCount = computed(() =>')
    expect(dashboard).toContain("item.status !== 'reviewed'")
    expect(dashboard).toContain('galleryStore.roots.reduce')
    expect(dashboard).toMatch(/unfinishedAnnotationCount:\s*taggerStore\.queue\.filter\([\s\S]*item\.status !== 'reviewed'[\s\S]*\)\.length/)
    expect(dashboard).toContain('rememberedWorkspace,')
    expect(dashboard).toContain('taggerStore.restoreSession()')
    expect(dashboard).toContain(':action="continueAction"')
    expect(dashboard).not.toContain('tabindex="0"')
  })

  it('uses distinct recent-work and monitor surfaces with layered pointer and keyboard feedback', () => {
    const dashboard = read('src/views/Dashboard.vue')
    const recentWork = read('src/components/dashboard/DashboardRecentWork.vue')
    const ui = `${dashboard}\n${recentWork}`

    expect(recentWork).toContain('action: DashboardAction')
    expect(recentWork).toContain('class="status-strip"')
    expect(recentWork).toContain('class="status-segment"')
    expect(recentWork).toContain('class="continue-button"')
    expect(recentWork).toContain(':aria-label="action.label"')
    expect(recentWork).toContain("emit('navigate', action.route)")
    expect(recentWork).toContain('scale(1.012)')
    expect(recentWork).toContain('scale(1.02)')
    expect(dashboard).toContain('scale(1.018)')
    expect(ui).toContain('opacity: 0.72')
    expect(ui).toContain('@media (hover: hover) and (pointer: fine)')
    expect(ui).toContain(':focus-visible')
    expect(ui).toContain(':focus-within')
    expect(ui).toContain('@media (prefers-reduced-motion: reduce)')

    expect(recentWork).toMatch(/\.recent-work\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1;/s)
    expect(recentWork).toMatch(/\.recent-work:focus-within\s*\{[^}]*z-index:\s*4;/s)
    expect(recentWork).toMatch(/\.recent-work:hover\s*\{[^}]*z-index:\s*4;/s)
    expect(dashboard).toMatch(/\.system-summary\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1;/s)
    expect(dashboard).toMatch(/\.system-summary:hover\s*\{[^}]*z-index:\s*4;/s)
    expect(dashboard).not.toContain('.system-summary:focus-visible')
    expect(dashboard).not.toContain(':has(.system-summary:focus-within)')

    const hoverMedia = dashboard.indexOf('@media (hover: hover) and (pointer: fine)')
    const recentFocus = dashboard.indexOf('.dashboard-sheet:has(.recent-work:focus-within) .recent-work {')
    expect(recentFocus).toBeGreaterThan(hoverMedia)
    expect(dashboard).toMatch(/:has\(\.recent-work:focus-within\) \.recent-work\s*\{[^}]*opacity:\s*1;[^}]*filter:\s*none;[^}]*z-index:\s*4;[^}]*scale\(1\.012\);/s)
    expect(dashboard).toMatch(/:has\(\.recent-work:focus-within\) \.system-summary\s*\{[^}]*z-index:\s*1;[^}]*opacity:\s*0\.72;/s)

    expect(recentWork).toContain('.status-strip:not(:has(.status-segment:focus-visible)):has(.status-segment:hover) .status-segment:not(:hover)')
    expect(recentWork).toContain('.status-strip:not(:has(.status-segment:focus-visible)) .status-segment:hover {')
    expect(recentWork).not.toContain('.status-strip:has(.status-segment:hover)')
  })

  it('keeps pressed status segments above later hover and keyboard declarations', () => {
    const recentWork = read('src/components/dashboard/DashboardRecentWork.vue')
    const hoverRule = recentWork.indexOf('.status-segment:hover {')
    const hoverActiveRule = recentWork.indexOf('.status-segment:hover:active')
    const focusRule = recentWork.indexOf('.status-segment:focus-visible {')
    const focusActiveRule = recentWork.indexOf('.status-segment:focus-visible:active')

    expect(hoverRule).toBeGreaterThan(-1)
    expect(hoverActiveRule).toBeGreaterThan(hoverRule)
    expect(focusRule).toBeGreaterThan(-1)
    expect(focusActiveRule).toBeGreaterThan(focusRule)
    expect(recentWork).toMatch(/\.status-segment:hover:active\s*\{[^}]*transform:\s*scale\(0\.985\);/s)
    expect(recentWork).toMatch(/\.status-segment:focus-visible:active\s*\{[^}]*transform:\s*scale\(0\.985\);/s)
  })

  it('animates finite monitor values once without an infinite fill pulse', () => {
    const monitor = read('src/components/monitor/SystemMonitor.vue')

    expect(monitor).toContain(':key="`cpu-${stats.cpu.usage}`"')
    expect(monitor).toContain(':key="`gpu-${stats.gpu.vramTotal > 0 ? stats.gpu.vramPercent : (stats.gpu.usage || 0)}`"')
    expect(monitor).toContain(':key="`ram-${stats.memory.percent}`"')
    expect(monitor).toContain('animation: value-update 260ms ease-out')
    expect(monitor).toContain('@keyframes value-update')
    expect(monitor).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.mon-val\s*\{\s*animation:\s*none;/s)
    expect(monitor).not.toContain(':class="{ pulse:')
    expect(monitor).not.toContain('mon-pulse 1.1s ease-in-out infinite')
    expect(monitor).not.toContain('infinite')
    expect(monitor).not.toContain('pulse-bar')
    expect(monitor).not.toContain('pulse-bar-glow')
    expect(monitor).not.toContain('barClass')
  })
})

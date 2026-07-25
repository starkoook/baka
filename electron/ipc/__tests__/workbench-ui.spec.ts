import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboard = readFileSync(resolve(process.cwd(), 'src/views/Dashboard.vue'), 'utf8')
const gallery = readFileSync(resolve(process.cwd(), 'src/views/TaggerV2.vue'), 'utf8')
const layout = readFileSync(resolve(process.cwd(), 'src/layouts/MainLayout.vue'), 'utf8')

describe('stable workbench UI', () => {
  it('uses the mascot cabin dashboard instead of a tutorial workflow', () => {
    expect(dashboard).toContain("import Mascot from '@/components/monitor/Mascot.vue'")
    expect(dashboard).toContain("import SystemMonitor from '@/components/monitor/SystemMonitor.vue'")
    expect(dashboard).toContain('图库与标注')
    expect(dashboard).toContain('提示词反推')
    expect(dashboard).toContain('训练中心')
    expect(dashboard).toContain('继续工作')
    expect(dashboard).not.toContain('workflow-grid')
    expect(dashboard).not.toContain('var(--text-inverse)')
  })

  it('keeps a visible inspector beside the gallery', () => {
    expect(gallery).toContain('browse-inspector')
    expect(gallery).toContain('发送到反推')
  })

  it('provides a reduced-motion fallback for ambient effects', () => {
    expect(layout).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

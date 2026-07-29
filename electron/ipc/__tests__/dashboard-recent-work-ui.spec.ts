import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('dashboard recent work', () => {
  it('renders dashboard summary rows and the active task through a small component contract', () => {
    const recentWork = read('src/components/dashboard/DashboardRecentWork.vue')

    expect(recentWork).toContain("import type { DashboardAction } from '@/features/dashboard/dashboard-summary'")
    expect(recentWork).toContain('items: Array<DashboardAction & { value: string }>')
    expect(recentWork).toContain('task: { name: string; progress: number; eta: string; speed: string } | null')
    expect(recentWork).toContain("defineEmits<{ navigate: [route: string] }>()")
    expect(recentWork).toContain('v-for="item in items"')
    expect(recentWork).toContain("emit('navigate', item.route)")
    expect(recentWork).toContain('v-if="task"')
    expect(recentWork).toContain('const displayProgress = computed(() =>')
    expect(recentWork).toContain('Math.min(100, Math.max(0, taskProgress))')
    expect(recentWork).toContain('{{ displayProgress }}%')
    expect(recentWork).toContain(':aria-valuenow="displayProgress"')
    expect(recentWork).toContain('`${displayProgress}%`')
    expect(recentWork).toContain('overflow-wrap: anywhere')
    expect(recentWork).toContain('flex-shrink: 0')
  })

  it('composes the dashboard from summary helpers, the hero, recent work, and system monitor', () => {
    const dashboard = read('src/views/Dashboard.vue')

    expect(dashboard).toContain('getContinueAction,')
    expect(dashboard).toContain('getDashboardSnapshot,')
    expect(dashboard).toContain('resolveDashboardRoute,')
    expect(dashboard).toContain("from '@/features/dashboard/dashboard-summary'")
    expect(dashboard).toContain('router.resolve(candidate).matched.length > 0')
    expect(dashboard).toContain('const displayTask = computed(() =>')
    expect(dashboard).toContain('pipelineStore.currentTask?.name.trim()')
    expect(dashboard).toContain(':show-artwork="appStore.showMascot"')
    expect(dashboard).toContain(':items="snapshot"')
    expect(dashboard).toContain(':task="displayTask"')
    expect(dashboard).toContain('<SystemMonitor class="dashboard-system" />')
    expect(dashboard).toContain('useDashboardScrollHandoff')
    expect(dashboard).toContain('class="dashboard-hero-layer"')
    expect(dashboard).toContain('class="dashboard-workspace-layer"')
    expect(dashboard).toContain('@media (max-width: 1160px)')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { computeCpuUsage, createSystemStatsService, parseNvidiaSmi } from '../system-stats.js'

function cpuSample(idle: number, busy: number) {
  return [{ times: { user: busy, nice: 0, sys: 0, irq: 0, idle } }]
}

describe('system stats', () => {
  it('computes CPU usage from the delta between two samples, not the lifetime average', () => {
    // Lifetime average would be 50%; the last interval was fully busy.
    const previous = cpuSample(1000, 1000)
    const current = cpuSample(1000, 1400)
    expect(computeCpuUsage(previous, current)).toBe(100)
    expect(computeCpuUsage(cpuSample(1000, 1000), cpuSample(1400, 1000))).toBe(0)
    expect(computeCpuUsage(cpuSample(1000, 1000), cpuSample(1200, 1200))).toBe(50)
  })

  it('falls back to the lifetime average when there is no previous sample', () => {
    expect(computeCpuUsage(null, cpuSample(1000, 3000))).toBe(75)
  })

  it('parses nvidia-smi csv output', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 4090, 2048, 24564, 51, 7\n')).toEqual({
      name: 'NVIDIA GeForce RTX 4090',
      vramUsed: 2048,
      vramTotal: 24564,
      gpuTemp: 51,
      gpuUsage: 7,
    })
    expect(parseNvidiaSmi('')).toBeNull()
  })

  it('never blocks: GPU probing is async and coalesced across overlapping calls', async () => {
    let resolveExec: ((value: { stdout: string }) => void) | null = null
    const execFileFn = vi.fn(() => new Promise<{ stdout: string }>((resolve) => { resolveExec = resolve }))
    const service = createSystemStatsService({
      execFileFn,
      osModule: { cpus: () => cpuSample(100, 100), totalmem: () => 16 * 1024 ** 3, freemem: () => 8 * 1024 ** 3, uptime: () => 10 },
      now: () => 0,
    })

    const first = service.getSystemStats()
    const second = service.getSystemStats()
    expect(execFileFn).toHaveBeenCalledTimes(1)

    resolveExec!({ stdout: 'RTX, 100, 1000, 40, 5' })
    const [a, b] = await Promise.all([first, second])
    expect(a.gpu).toEqual({ name: 'RTX', vramUsed: 100, vramTotal: 1000, vramPercent: 10, temp: 40, usage: 5 })
    expect(b.gpu).toEqual(a.gpu)
    expect(a.memory).toEqual({ used: 8192, total: 16384, percent: 50 })
  })

  it('stops probing once nvidia-smi is known to be unavailable', async () => {
    const execFileFn = vi.fn(async () => { throw Object.assign(new Error('not found'), { code: 'ENOENT' }) })
    let clock = 0
    const service = createSystemStatsService({
      execFileFn,
      osModule: { cpus: () => cpuSample(100, 100), totalmem: () => 1, freemem: () => 1, uptime: () => 0 },
      now: () => clock,
      unavailableRetryMs: 60_000,
      platform: 'win32',
    })

    // First poll: nvidia-smi fails, the static wmic fallback is probed exactly once.
    expect((await service.getSystemStats()).gpu).toBeNull()
    expect(execFileFn).toHaveBeenCalledTimes(2)
    expect(execFileFn.mock.calls.map((call: unknown[]) => call[0])).toEqual(['nvidia-smi', 'wmic'])

    clock = 2_000
    expect((await service.getSystemStats()).gpu).toBeNull()
    clock = 4_000
    await service.getSystemStats()
    expect(execFileFn).toHaveBeenCalledTimes(2)

    // After the retry window nvidia-smi is tried again (a driver may have been installed).
    clock = 61_000
    await service.getSystemStats()
    expect(execFileFn).toHaveBeenCalledTimes(3)
    expect(execFileFn.mock.calls[2][0]).toBe('nvidia-smi')
  })

  it('does not probe wmic outside Windows', async () => {
    const execFileFn = vi.fn(async () => { throw new Error('not found') })
    const service = createSystemStatsService({
      execFileFn,
      osModule: { cpus: () => cpuSample(100, 100), totalmem: () => 1, freemem: () => 1, uptime: () => 0 },
      now: () => 0,
      platform: 'linux',
    })
    expect((await service.getSystemStats()).gpu).toBeNull()
    expect(execFileFn).toHaveBeenCalledTimes(1)
  })

  it('reuses a fresh GPU reading instead of spawning nvidia-smi on every poll', async () => {
    const execFileFn = vi.fn(async () => ({ stdout: 'RTX, 100, 1000, 40, 5' }))
    let clock = 0
    const service = createSystemStatsService({
      execFileFn,
      osModule: { cpus: () => cpuSample(100, 100), totalmem: () => 1, freemem: () => 1, uptime: () => 0 },
      now: () => clock,
      gpuCacheMs: 1_500,
    })

    await service.getSystemStats()
    clock = 1_000
    await service.getSystemStats()
    expect(execFileFn).toHaveBeenCalledTimes(1)
    clock = 2_000
    await service.getSystemStats()
    expect(execFileFn).toHaveBeenCalledTimes(2)
  })
})

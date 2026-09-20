/**
 * System monitor stats (CPU / RAM / GPU) for the dashboard.
 *
 * Design goals:
 * - Never block the main process. The previous implementation used `execSync('nvidia-smi …')`
 *   every 2 s, which froze all IPC (thumbnails, dialogs, …) for up to 3 s on every poll and
 *   retried a slow `wmic` fallback forever on machines without an NVIDIA GPU.
 * - Report real-time CPU load from the delta between two samples instead of the lifetime average.
 * - Coalesce overlapping polls and cache GPU readings briefly so the UI can refresh often
 *   without spawning a process every time.
 */
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

const NVIDIA_SMI_ARGS = [
  '--query-gpu=name,memory.used,memory.total,temperature.gpu,utilization.gpu',
  '--format=csv,noheader,nounits',
]

function sumTimes(times) {
  let total = 0
  for (const key in times) total += times[key]
  return total
}

/**
 * Compute average CPU usage (0–100) between two `os.cpus()` samples.
 * Without a previous sample this falls back to the lifetime average.
 */
function computeCpuUsage(previousCpus, currentCpus) {
  if (!Array.isArray(currentCpus) || currentCpus.length === 0) return 0
  let idle = 0
  let total = 0
  for (let i = 0; i < currentCpus.length; i++) {
    const current = currentCpus[i].times
    const previous = previousCpus && previousCpus[i] ? previousCpus[i].times : null
    idle += current.idle - (previous ? previous.idle : 0)
    total += sumTimes(current) - (previous ? sumTimes(previous) : 0)
  }
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)))
}

function parseNvidiaSmi(stdout) {
  const line = String(stdout || '').trim().split('\n')[0]
  if (!line) return null
  const parts = line.split(',').map((s) => s.trim())
  return {
    name: parts[0] || 'NVIDIA GPU',
    vramUsed: parseFloat(parts[1]) || 0,
    vramTotal: parseFloat(parts[2]) || 0,
    gpuTemp: parseFloat(parts[3]) || 0,
    gpuUsage: parseFloat(parts[4]) || 0,
  }
}

function parseWmicVideoController(stdout) {
  const lines = String(stdout || '').split('\n').filter((l) => l.includes(','))
  if (lines.length < 2) return null
  const parts = lines[1].split(',')
  const ramBytes = parseInt(parts[parts.length - 1], 10) || 0
  return { name: (parts[1] || 'GPU').trim(), vramUsed: 0, vramTotal: Math.round(ramBytes / 1024 / 1024), gpuTemp: 0, gpuUsage: 0 }
}

function createSystemStatsService(options = {}) {
  const execFileFn = options.execFileFn || ((file, args, opts) => execFileAsync(file, args, opts))
  const osModule = options.osModule || os
  const now = options.now || Date.now
  const gpuCacheMs = options.gpuCacheMs ?? 1500
  const unavailableRetryMs = options.unavailableRetryMs ?? 60_000
  const execTimeoutMs = options.execTimeoutMs ?? 3000
  const platform = options.platform || process.platform

  let previousCpus = null
  let gpuCache = { value: null, at: -Infinity }
  let gpuInFlight = null
  let nvidiaUnavailableUntil = -Infinity
  let staticGpuFallback = undefined // undefined = not probed yet, null = nothing found

  async function probeNvidia() {
    const { stdout } = await execFileFn('nvidia-smi', NVIDIA_SMI_ARGS, { timeout: execTimeoutMs, windowsHide: true, encoding: 'utf-8' })
    return parseNvidiaSmi(stdout)
  }

  async function probeStaticFallback() {
    if (staticGpuFallback !== undefined) return staticGpuFallback
    staticGpuFallback = null
    if (platform === 'win32') {
      try {
        const { stdout } = await execFileFn('wmic', ['path', 'win32_VideoController', 'get', 'Name,AdapterRAM', '/format:csv'], { timeout: execTimeoutMs, windowsHide: true, encoding: 'utf-8' })
        staticGpuFallback = parseWmicVideoController(stdout)
      } catch (_) { staticGpuFallback = null }
    }
    return staticGpuFallback
  }

  async function readGpu() {
    const t = now()
    if (t - gpuCache.at < gpuCacheMs) return gpuCache.value
    if (gpuInFlight) return gpuInFlight
    gpuInFlight = (async () => {
      let value = null
      if (t >= nvidiaUnavailableUntil) {
        try {
          value = await probeNvidia()
        } catch (_) {
          nvidiaUnavailableUntil = now() + unavailableRetryMs
          value = await probeStaticFallback()
        }
      } else {
        value = await probeStaticFallback()
      }
      gpuCache = { value, at: now() }
      return value
    })()
    try { return await gpuInFlight } finally { gpuInFlight = null }
  }

  async function getSystemStats() {
    const cpus = osModule.cpus()
    const cpuUsage = computeCpuUsage(previousCpus, cpus)
    previousCpus = cpus
    const totalMem = osModule.totalmem()
    const freeMem = osModule.freemem()
    const gpu = await readGpu()
    return {
      cpu: { usage: cpuUsage, cores: cpus.length, model: (cpus[0] && cpus[0].model) || 'Unknown' },
      memory: {
        used: Math.round((totalMem - freeMem) / 1024 / 1024),
        total: Math.round(totalMem / 1024 / 1024),
        percent: totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0,
      },
      gpu: gpu ? {
        name: gpu.name,
        vramUsed: gpu.vramUsed,
        vramTotal: gpu.vramTotal,
        vramPercent: gpu.vramTotal > 0 ? Math.round((gpu.vramUsed / gpu.vramTotal) * 100) : 0,
        temp: gpu.gpuTemp || 0,
        usage: gpu.gpuUsage || 0,
      } : null,
      uptime: Math.round(osModule.uptime()),
      platform: process.platform,
    }
  }

  return { getSystemStats }
}

function registerSystemStatsHandlers(ipcMain, service = createSystemStatsService()) {
  ipcMain.handle('system:stats', () => service.getSystemStats())
  return service
}

module.exports = { computeCpuUsage, parseNvidiaSmi, parseWmicVideoController, createSystemStatsService, registerSystemStatsHandlers }

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { getGpuInfo } from '../tagger-models.js'

function loadModelDirResolver(config: Record<string, unknown> | null, configuredExists: boolean) {
  const sourcePath = resolve(process.cwd(), 'electron/ipc/tagger-models.js')
  const source = readFileSync(sourcePath, 'utf8')
  const module = { exports: {} as any }
  const fakeFs = {
    readFileSync: () => {
      if (!config) throw new Error('missing config')
      return JSON.stringify(config)
    },
    existsSync: (path: string) => configuredExists && path === config?.localModelDir,
  }
  const localRequire = (id: string) => {
    if (id === 'fs') return fakeFs
    if (id === 'path') return require('node:path')
    if (id === './paths') return {
      getConfigPath: () => 'config.json',
      getModelDir: () => 'D:\\BakaTOOLS\\tagger-models',
    }
    throw new Error(`Unexpected dependency: ${id}`)
  }
  const wrapper = vm.runInThisContext(`(function(require,module,exports){${source}\nmodule.exports.__getModelDirFromConfig = getModelDirFromConfig\n})`, { filename: sourcePath })
  wrapper(localRequire, module, module.exports)
  return module.exports.__getModelDirFromConfig as () => string
}

describe('tagger model directory resolution', () => {
  it('uses the configured model directory when it exists', () => {
    const resolveModelDir = loadModelDirResolver({ localModelDir: 'D:\\models' }, true)

    expect(resolveModelDir()).toBe('D:\\models')
  })

  it('falls back to the standard model directory without recursion', () => {
    const resolveModelDir = loadModelDirResolver(null, false)

    expect(resolveModelDir()).toBe('D:\\BakaTOOLS\\tagger-models')
  })
})

describe('tagger GPU info', () => {
  it('reads nvidia-smi without blocking the main process', async () => {
    const source = readFileSync(resolve(process.cwd(), 'electron/ipc/tagger-models.js'), 'utf8')
    expect(source).not.toContain('execSync')

    const execFileFn = vi.fn(async () => ({ stdout: 'RTX 4090, 24564, 2048\n' }))
    await expect(getGpuInfo(execFileFn)).resolves.toMatchObject({
      name: 'RTX 4090',
      vramTotalMb: 24564,
      vramUsedMb: 2048,
      provider: 'cuda',
    })
    expect(execFileFn).toHaveBeenCalledWith(
      'nvidia-smi',
      expect.arrayContaining(['--query-gpu=name,memory.total,memory.used']),
      expect.objectContaining({ timeout: 5000, windowsHide: true }),
    )
  })
})

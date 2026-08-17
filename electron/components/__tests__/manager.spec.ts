// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const { TrainingComponentManager } = require(resolve('electron/components/manager.js'))

const fixtureManifest = {
  formatVersion: 1,
  channel: 'test',
  components: {
    trainer: { id: 'trainer', version: 'v1.6.2', file: 'trainer.zip', size: 10, sha256: 'a'.repeat(64) },
    'runtime-standard': { id: 'runtime-standard', version: 'torch2.10-cu128-v1', file: 'runtime.zip', size: 20, sha256: 'b'.repeat(64) },
  },
}

function createFixture(overrides: Record<string, any> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'baka-manager-'))
  const calls: string[] = []
  const manager = new TrainingComponentManager({
    dataRoot: root,
    bakaVersion: '0.2.0',
    readManifest: async () => fixtureManifest,
    recommendation: async () => ({ preferred_runtime_id: 'standard' }),
    diskSpace: async () => ({ free: 1000 }),
    downloadFactory: (component: any) => ({
      start: async () => { calls.push(`download:${component.id}`); return { ok: true, target: `${component.id}.zip` } },
      pause() {}, cancel() {},
    }),
    archiveInstaller: async ({ componentId }: any) => { calls.push(`install:${componentId}`); return { path: join(root, componentId) } },
    runtimeHealthCheck: async () => ({ ok: true }),
    isTrainingActive: () => false,
    cache: { clear: async () => ({ success: true }), export: async () => ({ success: true }), import: async () => ({ success: true }) },
    ...overrides,
  })
  return { root, calls, manager }
}

describe('training component manager', () => {
  it('installs trainer before runtime and persists four versions', async () => {
    const { root, calls, manager } = createFixture()
    await manager.install('standard')
    expect(calls).toEqual(['download:trainer', 'install:trainer', 'download:runtime-standard', 'install:runtime-standard'])
    expect(JSON.parse(readFileSync(join(root, 'component-state.json'), 'utf8')).versions).toEqual({ baka: '0.2.0', trainer: 'v1.6.2', schema: 'v1.6.2', runtime: 'torch2.10-cu128-v1' })
  })

  it('blocks before download when disk space is insufficient', async () => {
    const { calls, manager } = createFixture({ diskSpace: async () => ({ free: 15 }) })
    await expect(manager.install('standard')).rejects.toThrow('磁盘空间不足')
    expect(calls).toEqual([])
  })

  it('does not mutate components while training is active', async () => {
    const { manager } = createFixture({ isTrainingActive: () => true })
    await expect(manager.install('standard')).rejects.toThrow('训练正在运行')
    await expect(manager.rollback('trainer')).rejects.toThrow('训练正在运行')
    await expect(manager.clearCache()).rejects.toThrow('训练正在运行')
  })

  it('migrates an existing managed trainer without deleting it', async () => {
    const { root, manager } = createFixture()
    const trainer = join(root, 'trainer', 'versions', 'v1.6.1')
    mkdirSync(trainer, { recursive: true })
    writeFileSync(join(trainer, 'gui.py'), '')
    writeFileSync(join(root, 'trainer', 'active.json'), JSON.stringify({ current: 'v1.6.1', previous: '' }))
    await manager.migrateExisting()
    expect((await manager.inspect()).installed.trainer.version).toBe('v1.6.1')
  })

  it('rolls trainer and runtime back independently', async () => {
    const { manager } = createFixture()
    manager.state.installed = { trainer: { version: 'v2' }, 'runtime-standard': { version: 'runtime-v2' } }
    manager.state.previous = { trainer: { version: 'v1' }, 'runtime-standard': { version: 'runtime-v1' } }
    manager.writeState()
    await manager.rollback('trainer')
    expect((await manager.inspect()).installed.trainer.version).toBe('v1')
    expect((await manager.inspect()).installed['runtime-standard'].version).toBe('runtime-v2')
  })

  it('activates the previous component files when rolling state back', async () => {
    const activated: any[] = []
    const { manager } = createFixture({ activateComponent: async (...args: any[]) => activated.push(args) })
    manager.state.installed = { trainer: { version: 'v2', path: 'new' } }
    manager.state.previous = { trainer: { version: 'v1', path: 'old' } }

    await manager.rollback('trainer')

    expect(activated).toEqual([['trainer', { version: 'v1', path: 'old' }, { version: 'v2', path: 'new' }]])
  })

  it('rejects concurrent component mutations', async () => {
    let releaseManifest!: () => void
    const gate = new Promise<void>(resolve => { releaseManifest = resolve })
    const { manager } = createFixture({ readManifest: async () => { await gate; return fixtureManifest } })
    const first = manager.install('standard')

    await expect(manager.install('standard')).rejects.toThrow('另一个组件操作')
    releaseManifest()
    await first
  })

  it('restores compatible active components when a grouped upgrade fails', async () => {
    const activated: any[] = []
    const { manager } = createFixture({
      runtimeHealthCheck: async () => ({ ok: false, error: 'broken runtime' }),
      activateComponent: async (...args: any[]) => activated.push(args),
    })
    manager.state.installed = {
      trainer: { version: 'v1.6.1', path: 'old-trainer' },
      'runtime-standard': { version: 'runtime-old', path: 'old-runtime' },
    }

    await expect(manager.install('standard')).rejects.toThrow('broken runtime')
    expect((await manager.inspect()).installed.trainer.version).toBe('v1.6.1')
    expect((await manager.inspect()).installed['runtime-standard'].version).toBe('runtime-old')
    expect(activated.map(args => args[0])).toEqual(['runtime-standard', 'trainer'])
  })

  it('does not report ready when installed files fail inspection', async () => {
    const { manager } = createFixture({ inspectHealth: async () => ({ ok: false, error: 'missing files' }) })
    manager.state.installed = { trainer: { version: 'v1' }, 'runtime-standard': { version: 'r1' } }

    expect(await manager.inspect()).toMatchObject({ ready: false, health: { ok: false, error: 'missing files' } })
  })

  it('migrates an existing runtime without downloading it again', async () => {
    const { manager } = createFixture({ findLegacyRuntime: async () => ({ id: 'standard', version: 'legacy-torch', path: 'legacy-repo' }) })

    await manager.migrateExisting()

    expect((await manager.inspect()).installed['runtime-standard']).toMatchObject({ version: 'legacy-torch', path: 'legacy-repo', migrated: true })
  })

  it('rejects an incompatible imported cache before replacing the active source', async () => {
    let imported = false
    const incompatible = JSON.parse(JSON.stringify(fixtureManifest))
    incompatible.components.trainer.minimumBaka = '9.0.0'
    const { manager } = createFixture({
      cache: {
        inspect: async () => ({ manifest: incompatible }),
        import: async () => { imported = true },
        clear: async () => ({}), export: async () => ({}),
      },
    })

    await expect(manager.importCache({ source: 'cache' })).rejects.toThrow('Baka')
    expect(imported).toBe(false)
  })
})

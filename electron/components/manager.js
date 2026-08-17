const fs = require('fs')
const path = require('path')
const { parseManifest, selectInstallSet } = require('./manifest')
const { getInstalledTrainer } = require('../runtime/trainer-distribution')

function emptyState(bakaVersion) {
  return {
    versions: { baka: bakaVersion, trainer: '', schema: '', runtime: '' },
    installed: {},
    previous: {},
    updatedAt: '',
  }
}

class TrainingComponentManager {
  constructor(options) {
    Object.assign(this, options)
    this.statePath = path.join(this.dataRoot, 'component-state.json')
    this.state = this.readState()
    this.operation = { status: 'idle', componentId: '', progress: null, error: '' }
    this.activeDownload = null
    this.mutation = null
  }

  readState() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.statePath, 'utf8'))
      return { ...emptyState(this.bakaVersion), ...stored, versions: { ...emptyState(this.bakaVersion).versions, ...stored.versions } }
    } catch {
      return emptyState(this.bakaVersion)
    }
  }

  writeState() {
    fs.mkdirSync(this.dataRoot, { recursive: true })
    const temporary = `${this.statePath}.tmp`
    this.state.updatedAt = new Date().toISOString()
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), 'utf8')
    fs.renameSync(temporary, this.statePath)
  }

  assertMutable() {
    if (this.isTrainingActive?.()) throw new Error('训练正在运行，不能切换或清理训练组件')
  }

  async withMutation(name, action) {
    this.assertMutable()
    if (this.mutation) throw new Error(`另一个组件操作正在进行：${this.mutation}`)
    this.mutation = name
    try {
      return await action()
    } finally {
      this.mutation = null
    }
  }

  updateVersions(runtimeId = '') {
    const trainer = this.state.installed.trainer
    const runtime = runtimeId
      ? this.state.installed[`runtime-${runtimeId}`]
      : Object.entries(this.state.installed).find(([id]) => id.startsWith('runtime-'))?.[1]
    this.state.versions.trainer = trainer?.version || ''
    this.state.versions.schema = trainer?.schemaVersion || trainer?.version || ''
    this.state.versions.runtime = runtime?.version || ''
  }

  async inspect() {
    let manifest = null
    let recommendation = null
    let downloadBytes = 0
    try {
      manifest = parseManifest(await this.readManifest())
      recommendation = await this.recommendation()
      const runtimeId = recommendation?.preferred_runtime_id || 'standard'
      downloadBytes = selectInstallSet(manifest, runtimeId, this.bakaVersion)
        .filter(component => this.state.installed[component.id]?.version !== component.version)
        .reduce((sum, component) => sum + component.size, 0)
    } catch {}
    const recordedReady = !!this.state.installed.trainer && Object.keys(this.state.installed).some(id => id.startsWith('runtime-'))
    let health = { ok: recordedReady }
    if (recordedReady && this.inspectHealth) {
      try { health = await this.inspectHealth(this.state.installed) } catch (error) { health = { ok: false, error: error.message } }
    }
    return {
      ready: recordedReady && !!health.ok,
      installed: this.state.installed,
      previous: this.state.previous,
      versions: this.state.versions,
      operation: this.operation,
      recommendation,
      manifest,
      downloadBytes,
      health,
    }
  }

  install(runtimeId, options = {}) {
    return this.withMutation('install', () => this.installUnlocked(runtimeId, options))
  }

  async restoreChanged(changed, runtimeId) {
    for (const item of [...changed].reverse()) {
      if (item.current) {
        await this.activateComponent?.(item.componentId, item.current, item.installed)
        this.state.installed[item.componentId] = item.current
      } else {
        delete this.state.installed[item.componentId]
      }
      if (item.previous) this.state.previous[item.componentId] = item.previous
      else delete this.state.previous[item.componentId]
    }
    this.updateVersions(runtimeId)
    this.writeState()
  }

  async installUnlocked(runtimeId, { force = false } = {}) {
    const manifest = parseManifest(await this.readManifest())
    const components = selectInstallSet(manifest, runtimeId, this.bakaVersion)
    const pending = force
      ? components
      : components.filter(component => this.state.installed[component.id]?.version !== component.version)
    const requiredDiskBytes = Math.ceil(pending.reduce(
      (sum, component) => sum + component.size + (component.installedSize || component.size),
      0,
    ) * 1.1)
    const space = await this.diskSpace(this.dataRoot)
    if (space.free < requiredDiskBytes) {
      throw new Error(`磁盘空间不足，需要至少 ${requiredDiskBytes} 字节可用空间`)
    }

    this.operation = { status: 'installing', componentId: '', progress: null, error: '' }
    const changed = []
    try {
      for (const component of pending) {
        this.operation.componentId = component.id
        const download = this.downloadFactory(component, progress => {
          this.operation = { ...this.operation, progress }
        })
        this.activeDownload = download
        const downloaded = await download.start()
        if (!downloaded?.ok) {
          await this.restoreChanged(changed, runtimeId)
          this.operation.status = downloaded?.paused ? 'paused' : 'idle'
          return { success: false, ...downloaded }
        }
        const installed = await this.archiveInstaller({
          componentId: component.id,
          component,
          archivePath: downloaded.target,
          runtimeId,
        })
        const current = this.state.installed[component.id]
        const previous = this.state.previous[component.id]
        if (current && current.version !== component.version) this.state.previous[component.id] = current
        this.state.installed[component.id] = { version: component.version, schemaVersion: component.schemaVersion, path: installed.path || '', installedAt: new Date().toISOString() }
        changed.push({ componentId: component.id, current, previous, installed: this.state.installed[component.id] })
        if (component.id === 'trainer') {
          this.state.versions.trainer = component.version
          this.state.versions.schema = component.schemaVersion || component.version
        } else if (component.id.startsWith('runtime-')) {
          this.state.versions.runtime = component.version
        }
        this.writeState()
      }

      const health = await this.runtimeHealthCheck(runtimeId, this.state.installed[`runtime-${runtimeId}`])
      if (!health?.ok) throw new Error(health?.error || '训练环境健康检查未通过')
      this.operation = { status: 'ready', componentId: '', progress: null, error: '' }
      return { success: true, runtimeId, installed: this.state.installed }
    } catch (error) {
      if (changed.length) {
        try { await this.restoreChanged(changed, runtimeId) } catch (restoreError) { error.message += `；自动恢复失败：${restoreError.message}` }
      }
      this.operation = { ...this.operation, status: 'failed', error: error.message || String(error) }
      throw error
    } finally {
      this.activeDownload = null
    }
  }

  pause() {
    this.activeDownload?.pause()
  }

  resume(runtimeId) {
    return this.install(runtimeId)
  }

  repair(runtimeId) {
    return this.install(runtimeId, { force: true })
  }

  cancel() {
    this.activeDownload?.cancel()
  }

  async rollback(componentId) {
    return this.withMutation('rollback', () => this.rollbackUnlocked(componentId))
  }

  async rollbackUnlocked(componentId) {
    const previous = this.state.previous[componentId]
    if (!previous) throw new Error(`${componentId} 没有可回退的版本`)
    const current = this.state.installed[componentId]
    await this.activateComponent?.(componentId, previous, current)
    this.state.installed[componentId] = previous
    this.state.previous[componentId] = current
    if (componentId === 'trainer') {
      this.state.versions.trainer = previous.version
      this.state.versions.schema = previous.schemaVersion || previous.version
    } else if (componentId.startsWith('runtime-')) {
      this.state.versions.runtime = previous.version
    }
    this.writeState()
    return { success: true, componentId, installed: previous }
  }

  async migrateExisting() {
    let migrated = false
    if (!this.state.installed.trainer) {
      const trainer = getInstalledTrainer(this.dataRoot)
      if (trainer) {
        this.state.installed.trainer = { version: trainer.version, path: trainer.path, installedAt: new Date().toISOString(), migrated: true }
        migrated = true
      }
    }
    if (!Object.keys(this.state.installed).some(id => id.startsWith('runtime-')) && this.findLegacyRuntime) {
      const runtime = await this.findLegacyRuntime()
      if (runtime?.path) {
        const componentId = `runtime-${runtime.id || 'standard'}`
        this.state.installed[componentId] = { version: runtime.version || 'legacy-imported', path: runtime.path, installedAt: new Date().toISOString(), migrated: true }
        migrated = true
      }
    }
    if (!migrated) return { migrated: false }
    this.updateVersions()
    this.writeState()
    return { migrated: true, installed: this.state.installed }
  }

  async clearCache() {
    return this.withMutation('clear-cache', () => this.cache.clear())
  }

  exportCache(options) {
    return this.cache.export(options)
  }

  importCache(options) {
    return this.withMutation('import-cache', async () => {
      if (this.cache.inspect) {
        const inspected = await this.cache.inspect(options)
        const recommendation = await this.recommendation()
        if (!recommendation?.preferred_runtime_id) throw new Error('无法确定当前电脑需要的训练环境')
        selectInstallSet(inspected.manifest, recommendation.preferred_runtime_id, this.bakaVersion)
      }
      return this.cache.import(options)
    })
  }
}

module.exports = { TrainingComponentManager }

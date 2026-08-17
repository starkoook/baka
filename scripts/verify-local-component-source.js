#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { installArchive } = require('../electron/components/archive')
const { ComponentDownload, sha256File } = require('../electron/components/download')
const { TrainingComponentManager } = require('../electron/components/manager')

const root = path.resolve(__dirname, '..')
const sourceRoot = path.join(root, '.cache', 'component-source')
const acceptanceRoot = path.join(root, '.cache', 'component-acceptance')
const reportPath = path.join(root, 'release', 'component-source-acceptance.json')

async function verifyLocalComponentSource() {
  fs.rmSync(acceptanceRoot, { recursive: true, force: true })
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'manifest.json'), 'utf8'))
  const startedAt = new Date().toISOString()
  const report = { formatVersion: 1, startedAt, source: sourceRoot, success: false }

  try {
    for (const component of Object.values(manifest.components)) {
      const actual = await sha256File(path.join(sourceRoot, component.file))
      if (actual.toLowerCase() !== component.sha256.toLowerCase()) throw new Error(`${component.file} SHA-256 mismatch`)
    }

    const manager = new TrainingComponentManager({
      dataRoot: acceptanceRoot,
      bakaVersion: require('../package.json').version,
      readManifest: async () => manifest,
      recommendation: async () => ({ preferred_runtime_id: 'standard' }),
      diskSpace: async target => {
        fs.mkdirSync(target, { recursive: true })
        const stats = fs.statfsSync(target)
        return { free: Number(stats.bavail) * Number(stats.bsize) }
      },
      isTrainingActive: () => false,
      downloadFactory: component => new ComponentDownload({
        source: path.join(sourceRoot, component.file),
        target: path.join(acceptanceRoot, 'cache', component.file),
        size: component.size,
        sha256: component.sha256,
      }),
      archiveInstaller: ({ componentId, component, archivePath, runtimeId }) => {
        const componentRoot = componentId === 'trainer'
          ? path.join(acceptanceRoot, 'trainer')
          : path.join(acceptanceRoot, 'runtimes', runtimeId)
        return installArchive({
          archivePath,
          versionsRoot: path.join(componentRoot, 'versions'),
          version: component.version,
          activePath: path.join(componentRoot, 'active.json'),
          healthCheck: directory => componentId === 'trainer'
            ? fs.existsSync(path.join(directory, 'gui.py'))
            : fs.existsSync(path.join(directory, 'python', 'python.exe')),
        })
      },
      runtimeHealthCheck: async (_runtimeId, installed) => {
        const python = path.join(installed.path, 'python', 'python.exe')
        return { ok: fs.existsSync(python) }
      },
      cache: { clear: async () => ({}), export: async () => ({}), import: async () => ({}) },
    })

    await manager.install('standard')
    const state = await manager.inspect()
    const python = path.join(state.installed['runtime-standard'].path, 'python', 'python.exe')
    const torch = execFileSync(python, ['-c', 'import json, torch; print(json.dumps({"version": torch.__version__, "cuda": torch.cuda.is_available()}))'], {
      encoding: 'utf8', timeout: 60000, windowsHide: true,
    }).trim().split(/\r?\n/).pop()
    Object.assign(report, {
      success: true,
      completedAt: new Date().toISOString(),
      versions: state.versions,
      packages: Object.fromEntries(Object.entries(manifest.components).map(([id, item]) => [id, {
        file: item.file, size: item.size, sha256: item.sha256,
      }])),
      runtimeHealth: JSON.parse(torch),
    })
  } catch (error) {
    Object.assign(report, { completedAt: new Date().toISOString(), error: error.message })
    throw error
  } finally {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
    fs.rmSync(acceptanceRoot, { recursive: true, force: true })
  }
  console.log(`[components] acceptance passed: ${reportPath}`)
}

verifyLocalComponentSource().catch(error => {
  console.error(error)
  process.exitCode = 1
})

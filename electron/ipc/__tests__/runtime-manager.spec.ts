import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const managerPath = resolve(process.cwd(), 'electron/ipc/runtime-manager.js')
const bridgePath = resolve(process.cwd(), 'electron/runtime/launcher_bridge.py')
const bundledRepo = resolve(process.cwd(), 'lora-rescripts-main')

describe('runtime launcher core bridge', () => {
  it('reads runtime definitions from the selected trainer repository', () => {
    expect(existsSync(bridgePath)).toBe(true)
    const result = spawnSync('python', [bridgePath, '--repo', bundledRepo], {
      input: `${JSON.stringify({ id: 'one', method: 'get_runtime_defs', params: {} })}\n`,
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    const response = JSON.parse(result.stdout.trim())
    expect(response.id).toBe('one')
    expect(response.ok).toBe(true)
    expect(response.result.length).toBeGreaterThan(1)
    expect(response.result[0]).toHaveProperty('id')
  })

  it('does not duplicate runtime definitions or synchronous installers in Electron', () => {
    const source = readFileSync(managerPath, 'utf8')

    expect(source).not.toContain('const RUNTIME_DEFS = [')
    expect(source).not.toContain('execSync(`"${pip}" install')
    expect(source).toContain('runLauncherBridge')
  })

  it('initializes a missing project-local Python before dependency installation', () => {
    const managerSource = readFileSync(managerPath, 'utf8')
    const bridgeSource = readFileSync(bridgePath, 'utf8')

    expect(bridgeSource).toContain('initialize_runtime_environment')
    expect(bridgeSource).toContain('initialize_runtime')
    expect(managerSource).toContain("'initialize_runtime'")
    expect(managerSource).toContain('python_exists')
  })

  it('only reports cancellation after the active process exits', () => {
    const source = readFileSync(managerPath, 'utf8')
    const cancelHandler = source.match(/function requestInstallCancellation[\s\S]*?\n\}/)?.[0] ?? ''

    expect(cancelHandler).toContain('cancelling')
    expect(cancelHandler).not.toContain("webContents.send('runtime:installCancelled'")
  })

  it('never uses the developer reference directory in packaged builds', () => {
    const source = readFileSync(managerPath, 'utf8')

    expect(source).toContain("if (app.isPackaged) return selectTrainerRepo('', [installed])")
    expect(source).not.toContain("path.join(process.resourcesPath, 'trainer-core')")
    expect(source).not.toContain('ensureBundledTrainer')
    expect(source).toContain('getInstalledTrainer')
  })

  it('launches packaged training only with the managed runtime Python', () => {
    const source = readFileSync(managerPath, 'utf8')

    expect(source).toContain("getManagedRuntime(app.getPath('userData'), runtimeId)")
    expect(source).toContain("spawn(managed.pythonPath, ['gui.py'")
  })

  it('delegates GPU recommendation and health checks to the trainer core', () => {
    const source = readFileSync(managerPath, 'utf8')

    expect(source).toContain("ipcMain.handle('runtime:recommendation'")
    expect(source).toContain("'get_runtime_recommendation'")
    expect(source).toContain("ipcMain.handle('runtime:health'")
    expect(source).toContain("'get_health_report'")
  })
})

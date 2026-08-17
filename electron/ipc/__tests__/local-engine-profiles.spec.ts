import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectEngineRoot, loadProfiles, removeProfile, saveProfile } from '../local-engine/profiles.js'

const roots: string[] = []
const temp = (prefix: string) => {
  const root = mkdtempSync(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('local engine profiles', () => {
  it('detects a portable ComfyUI installation and derives managed paths', () => {
    const root = temp('baka-comfy-')
    mkdirSync(join(root, 'ComfyUI', 'custom_nodes'), { recursive: true })
    mkdirSync(join(root, 'ComfyUI', 'models'), { recursive: true })
    mkdirSync(join(root, 'ComfyUI', 'output'), { recursive: true })
    mkdirSync(join(root, 'python_embeded'), { recursive: true })
    writeFileSync(join(root, 'ComfyUI', 'main.py'), '')
    writeFileSync(join(root, 'python_embeded', 'python.exe'), '')

    expect(detectEngineRoot(root, 'comfy')).toMatchObject({
      valid: true,
      root,
      engineRoot: join(root, 'ComfyUI'),
      customNodesDir: join(root, 'ComfyUI', 'custom_nodes'),
      pythonPath: join(root, 'python_embeded', 'python.exe'),
    })
  })

  it('rejects a ComfyUI root with no verified Python executable', () => {
    const root = temp('baka-comfy-no-python-')
    writeFileSync(join(root, 'main.py'), '')
    expect(detectEngineRoot(root, 'comfy')).toEqual({ valid: false, error: '没有找到 ComfyUI 使用的 Python' })
  })

  it('recognizes WebUI and keeps derived paths inside its selected root', () => {
    const root = temp('baka-webui-')
    writeFileSync(join(root, 'webui-user.bat'), '')
    const result = detectEngineRoot(root, 'webui')
    expect(result).toMatchObject({ valid: true, type: 'webui', root, extensionsDir: join(root, 'extensions') })
    expect(result.modelsDir.startsWith(root)).toBe(true)
    expect(result.outputDir.startsWith(root)).toBe(true)
  })

  it('round-trips and removes profiles in an injected data root', () => {
    const dataRoot = temp('baka-profile-')
    saveProfile(dataRoot, { id: 'local-comfy', type: 'comfy', name: '本机 ComfyUI', root: 'D:/ComfyUI', baseUrl: 'http://127.0.0.1:8188' })
    saveProfile(dataRoot, { id: 'local-webui', type: 'webui', name: '本机 WebUI', root: 'D:/WebUI', baseUrl: 'http://127.0.0.1:7860' })
    expect(loadProfiles(dataRoot)).toHaveLength(2)
    removeProfile(dataRoot, 'local-comfy')
    expect(loadProfiles(dataRoot)).toEqual([expect.objectContaining({ id: 'local-webui' })])
  })
})

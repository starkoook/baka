import { describe, expect, it, vi } from 'vitest'
import { createLocalEngineService, registerLocalEngineHandlers } from '../local-engines.js'

function createFixture() {
  const profiles = [{
    id: 'comfy-1', type: 'comfy', name: 'Comfy', root: 'D:/Comfy', engineRoot: 'D:/Comfy',
    mainPath: 'D:/Comfy/main.py', pythonPath: 'D:/Comfy/python.exe', customNodesDir: 'D:/Comfy/custom_nodes', baseUrl: 'http://127.0.0.1:8188',
  }, {
    id: 'webui-1', type: 'webui', name: 'WebUI', root: 'D:/WebUI', entryPath: 'D:/WebUI/webui-user.bat', baseUrl: 'http://127.0.0.1:7860',
  }]
  const profileStore = {
    loadProfiles: vi.fn(() => profiles),
    saveProfile: vi.fn((_root, profile) => profile),
    removeProfile: vi.fn(),
    detectEngineRoot: vi.fn((root, type) => ({ valid: true, root, type, engineRoot: root, mainPath: `${root}/main.py`, pythonPath: `${root}/python.exe`, customNodesDir: `${root}/custom_nodes`, baseUrl: type === 'comfy' ? 'http://127.0.0.1:8188' : 'http://127.0.0.1:7860' })),
    detectLocalEngines: vi.fn(() => []),
  }
  const comfy = { healthComfy: vi.fn(async () => ({ healthy: true })), listComfyModels: vi.fn(async () => ['anime']), getComfyObjectInfo: vi.fn(async () => ({ Core: {}, Fancy: {} })), editWithComfy: vi.fn(async () => 'data:image/png;base64,AAA') }
  const webui = { healthWebUI: vi.fn(async () => ({ healthy: true })), listWebUIModels: vi.fn(async () => ['web-anime']), editWithWebUI: vi.fn(async () => 'data:image/png;base64,BBB') }
  const dependencies = { loadDependencyMap: vi.fn(async () => ({ nodeNames: new Map(), registryIds: new Map() })), resolveMissingNodes: vi.fn(() => []) }
  const gitInstall = { installRepository: vi.fn(async () => ({ target: 'D:/Comfy/custom_nodes/Pack', requirementsPath: '', requiresRestart: true })), updateRepository: vi.fn(async () => ({ requiresRestart: true })), deriveRepositoryTarget: vi.fn(() => 'D:/Comfy/custom_nodes/Pack'), installRequirements: vi.fn(async () => ({ requiresRestart: true })) }
  return { profiles, profileStore, comfy, webui, dependencies, gitInstall }
}

describe('local engine IPC service', () => {
  it('routes engine operations using only a saved profile id', async () => {
    const fixture = createFixture()
    const service = createLocalEngineService({ dataRoot: 'D:/data', ...fixture, spawnFn: vi.fn() })

    await expect(service.listProfiles()).resolves.toEqual([
      expect.objectContaining({ id: 'comfy-1', type: 'comfy', baseUrl: 'http://127.0.0.1:8188' }),
      expect.objectContaining({ id: 'webui-1', type: 'webui', baseUrl: 'http://127.0.0.1:7860' }),
    ])
    await expect(service.health('comfy-1')).resolves.toEqual({ healthy: true })
    await expect(service.listModels('webui-1')).resolves.toEqual(['web-anime'])
    await expect(service.objectInfo('comfy-1')).resolves.toEqual({ Core: {}, Fancy: {} })
    await expect(service.editImage({ profileId: 'webui-1', imageBase64: 'AAA', pythonPath: 'unsafe', customNodesDir: 'unsafe' })).resolves.toEqual({ success: true, image: 'data:image/png;base64,BBB' })
    expect(fixture.webui.editWithWebUI).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'http://127.0.0.1:7860', imageBase64: 'AAA' }))
    expect(fixture.webui.editWithWebUI.mock.calls[0][0]).not.toHaveProperty('pythonPath')
    expect(fixture.webui.editWithWebUI.mock.calls[0][0]).not.toHaveProperty('customNodesDir')
  })

  it('validates before save and does not persist renderer-supplied managed paths', async () => {
    const fixture = createFixture()
    const service = createLocalEngineService({ dataRoot: 'D:/data', ...fixture })
    const saved = await service.saveProfile({ id: 'new', type: 'comfy', name: 'Mine', root: 'D:/chosen', pythonPath: 'unsafe' })
    expect(saved).toMatchObject({ id: 'new', name: 'Mine', root: 'D:/chosen', pythonPath: 'D:/chosen/python.exe' })
    expect(fixture.profileStore.saveProfile).toHaveBeenCalledWith('D:/data', expect.objectContaining({ customNodesDir: 'D:/chosen/custom_nodes' }))
  })

  it('uses only the saved Comfy paths for dependency and installation actions', async () => {
    const fixture = createFixture()
    const service = createLocalEngineService({ dataRoot: 'D:/data', ...fixture })
    await service.resolveDependencies({ profileId: 'comfy-1', required: ['Fancy'], hints: [] })
    await service.installRepository({ profileId: 'comfy-1', repository: 'https://github.com/acme/Pack', customNodesDir: 'unsafe' })
    await service.installRequirements({ profileId: 'comfy-1', repository: 'https://github.com/acme/Pack', pythonPath: 'unsafe' })
    expect(fixture.dependencies.resolveMissingNodes).toHaveBeenCalledWith(['Fancy'], ['Core', 'Fancy'], [], expect.anything())
    expect(fixture.gitInstall.installRepository).toHaveBeenCalledWith(expect.objectContaining({ customNodesDir: 'D:/Comfy/custom_nodes' }))
    expect(fixture.gitInstall.installRequirements).toHaveBeenCalledWith(expect.objectContaining({
      pythonPath: 'D:/Comfy/python.exe',
      requirementsPath: expect.stringMatching(/custom_nodes[\\/]Pack[\\/]requirements\.txt$/),
    }))
  })

  it('registers all profile, adapter, dependency, and install handlers', () => {
    const fixture = createFixture()
    const handlers = new Map<string, Function>()
    registerLocalEngineHandlers({ handle: (channel: string, fn: Function) => handlers.set(channel, fn) }, { dataRoot: 'D:/data', ...fixture })
    expect([...handlers.keys()]).toEqual(expect.arrayContaining([
      'localEngine:detect', 'localEngine:listProfiles', 'localEngine:validateRoot', 'localEngine:saveProfile', 'localEngine:removeProfile',
      'localEngine:health', 'localEngine:listModels', 'localEngine:objectInfo', 'localEngine:start', 'localEngine:editImage',
      'localEngine:resolveDependencies', 'localEngine:refreshDependencyMap', 'localEngine:installRepository', 'localEngine:updateRepository', 'localEngine:installRequirements',
    ]))
  })
})

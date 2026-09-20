import { describe, expect, it } from 'vitest'
import {
  getRememberedWorkspace,
  getSettingsReturnTarget,
  loadLastWorkspace,
  loadRecentWorkspaces,
  normalizeWorkspaceRoute,
  saveLastWorkspace,
  type StorageReaderWriter,
} from '../workspace-history'

const STORAGE_KEY = 'baka-last-workspace-v1'

function createMemoryStorage(initialValue: string | null = null): StorageReaderWriter {
  const values = new Map<string, string>()

  if (initialValue !== null) {
    values.set(STORAGE_KEY, initialValue)
  }

  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

describe('workspace history', () => {
  it('normalizes only routes that can be resumed', () => {
    expect([
      '/gallery',
      '/tagger',
      '/training',
      '/training/runtime',
      '/reverse',
      '/upscale',
      '/generate',
      '/console',
    ].map(normalizeWorkspaceRoute)).toEqual([
      '/gallery',
      '/tagger',
      '/training',
      '/training/runtime',
      '/reverse',
      '/upscale',
      '/generate',
      '/console',
    ])
    expect(normalizeWorkspaceRoute('/')).toBeNull()
    expect(normalizeWorkspaceRoute('/settings')).toBeNull()
    expect(normalizeWorkspaceRoute('/unknown')).toBeNull()
    expect(normalizeWorkspaceRoute('toString')).toBeNull()
    expect(normalizeWorkspaceRoute('__proto__')).toBeNull()
    expect(normalizeWorkspaceRoute(null)).toBeNull()
  })

  it('normalizes additional tool routes that can be resumed', () => {
    expect(normalizeWorkspaceRoute('/booru-gallery')).toBe('/booru-gallery')
    expect(normalizeWorkspaceRoute('/workbench')).toBe('/workbench')
    expect(normalizeWorkspaceRoute('/video')).toBe('/video')
    expect(normalizeWorkspaceRoute('/image-tools')).toBe('/image-tools')
  })

  it('normalizes the training run route to the training workspace', () => {
    expect(normalizeWorkspaceRoute('/training/run')).toBe('/training')
  })

  it('normalizes video tool sub-routes to the video workspace', () => {
    expect(normalizeWorkspaceRoute('/video/convert')).toBe('/video')
    expect(normalizeWorkspaceRoute('/video/extract')).toBe('/video')
  })

  it('does not overwrite the saved workspace when visiting home or settings', () => {
    const storage = createMemoryStorage('/gallery')

    saveLastWorkspace('/', storage)
    saveLastWorkspace('/settings', storage)

    expect(storage.getItem(STORAGE_KEY)).toBe('/gallery')
  })

  it('returns the label for every valid workspace', () => {
    expect([
      '/gallery',
      '/tagger',
      '/training',
      '/training/runtime',
      '/reverse',
      '/upscale',
      '/generate',
      '/console',
    ].map(getRememberedWorkspace)).toEqual([
      { route: '/gallery', label: '继续整理图库', shortLabel: '图库' },
      { route: '/tagger', label: '返回标注工作区', shortLabel: '标注' },
      { route: '/training', label: '继续配置训练', shortLabel: '训练' },
      { route: '/training/runtime', label: '继续配置训练环境', shortLabel: '训练运行时' },
      { route: '/reverse', label: '继续提示词反推', shortLabel: '反推' },
      { route: '/upscale', label: '继续超分放大', shortLabel: '放大' },
      { route: '/generate', label: '继续 AI 生成', shortLabel: '生成' },
      { route: '/console', label: '返回控制台', shortLabel: '控制台' },
    ])
  })

  it('returns labels for newly resumable workspaces', () => {
    expect([
      '/booru-gallery',
      '/workbench',
      '/video',
      '/image-tools',
    ].map(getRememberedWorkspace)).toEqual([
      { route: '/booru-gallery', label: '继续浏览在线图库', shortLabel: '在线图库' },
      { route: '/workbench', label: '继续工作台', shortLabel: '工作台' },
      { route: '/video', label: '继续视频工具', shortLabel: '视频工具' },
      { route: '/image-tools', label: '继续图像工具', shortLabel: '图像工具' },
    ])
  })

  it('loads valid saved workspaces and ignores stale values', () => {
    const route = loadLastWorkspace(createMemoryStorage('/training/run'))

    expect(route).toBe('/training')
    expect(getRememberedWorkspace(route)).toEqual({
      route: '/training',
      label: '继续配置训练',
      shortLabel: '训练',
    })
    expect(loadLastWorkspace(createMemoryStorage('/removed-workspace'))).toBeNull()
    expect(loadLastWorkspace(createMemoryStorage())).toBeNull()
  })

  it('saves normalized valid routes with the versioned key', () => {
    const storage = createMemoryStorage()

    saveLastWorkspace('/training/run', storage)

    expect(storage.getItem(STORAGE_KEY)).toBe('/training')
  })

  it('keeps the three most recent distinct workspaces, newest first', () => {
    const storage = createMemoryStorage()

    saveLastWorkspace('/gallery', storage)
    saveLastWorkspace('/tagger', storage)
    saveLastWorkspace('/training/run', storage)
    saveLastWorkspace('/gallery', storage)
    saveLastWorkspace('/', storage)

    expect(loadRecentWorkspaces(storage).map((workspace) => workspace.route)).toEqual(['/gallery', '/training', '/tagger'])

    saveLastWorkspace('/workbench', storage)
    expect(loadRecentWorkspaces(storage).map((workspace) => workspace.route)).toEqual(['/workbench', '/gallery', '/training'])
    expect(loadRecentWorkspaces(storage)[0]).toEqual({ route: '/workbench', label: '继续工作台', shortLabel: '工作台' })
  })

  it('ignores corrupt or stale recent-workspace values', () => {
    const storage = createMemoryStorage()
    storage.setItem('baka-recent-workspaces-v1', '{"not":"an array"}')
    expect(loadRecentWorkspaces(storage)).toEqual([])
    storage.setItem('baka-recent-workspaces-v1', JSON.stringify(['/removed', 42, '/tagger', '/tagger']))
    expect(loadRecentWorkspaces(storage).map((workspace) => workspace.route)).toEqual(['/tagger'])
  })

  it('returns the remembered workspace as the settings return target', () => {
    expect(getSettingsReturnTarget(createMemoryStorage('/gallery'))).toEqual({
      route: '/gallery',
      label: '继续整理图库',
      shortLabel: '图库',
    })
    expect(getSettingsReturnTarget(createMemoryStorage('/video/extract'))).toEqual({
      route: '/video',
      label: '继续视频工具',
      shortLabel: '视频工具',
    })
    expect(getSettingsReturnTarget(createMemoryStorage())).toBeNull()
    expect(getSettingsReturnTarget(createMemoryStorage('/settings'))).toBeNull()
  })

  it('ignores storage read and write failures', () => {
    const throwingReader: StorageReaderWriter = {
      getItem() {
        throw new Error('read failed')
      },
      setItem() {},
    }
    const throwingWriter: StorageReaderWriter = {
      getItem() {
        return null
      },
      setItem() {
        throw new Error('write failed')
      },
    }

    expect(loadLastWorkspace(throwingReader)).toBeNull()
    expect(() => saveLastWorkspace('/gallery', throwingWriter)).not.toThrow()
  })

  it('ignores failures while resolving the default browser storage', () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    expect(localStorageDescriptor).toBeDefined()

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage unavailable')
      },
    })

    try {
      expect(loadLastWorkspace()).toBeNull()
      expect(() => saveLastWorkspace('/gallery')).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', localStorageDescriptor!)
    }
  })
})

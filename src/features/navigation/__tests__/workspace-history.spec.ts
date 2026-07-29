import { describe, expect, it } from 'vitest'
import {
  getRememberedWorkspace,
  loadLastWorkspace,
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

  it('normalizes the training run route to the training workspace', () => {
    expect(normalizeWorkspaceRoute('/training/run')).toBe('/training')
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
      { route: '/gallery', label: '继续整理图库' },
      { route: '/tagger', label: '返回标注工作区' },
      { route: '/training', label: '继续配置训练' },
      { route: '/training/runtime', label: '继续配置训练环境' },
      { route: '/reverse', label: '继续提示词反推' },
      { route: '/upscale', label: '继续超分放大' },
      { route: '/generate', label: '继续 AI 生成' },
      { route: '/console', label: '返回控制台' },
    ])
  })

  it('loads valid saved workspaces and ignores stale values', () => {
    const route = loadLastWorkspace(createMemoryStorage('/training/run'))

    expect(route).toBe('/training')
    expect(getRememberedWorkspace(route)).toEqual({
      route: '/training',
      label: '继续配置训练',
    })
    expect(loadLastWorkspace(createMemoryStorage('/removed-workspace'))).toBeNull()
    expect(loadLastWorkspace(createMemoryStorage())).toBeNull()
  })

  it('saves normalized valid routes with the versioned key', () => {
    const storage = createMemoryStorage()

    saveLastWorkspace('/training/run', storage)

    expect(storage.getItem(STORAGE_KEY)).toBe('/training')
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

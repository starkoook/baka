import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildNodeIndex, loadDependencyMap, resolveMissingNodes } from '../local-engine/dependencies.js'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })

describe('Comfy dependency resolution', () => {
  const index = buildNodeIndex({
    'https://github.com/acme/pack-a': [['FancyNode'], { title_aux: 'Pack A' }],
    'https://github.com/acme/pack-b': [['FancyNode', 'OtherNode'], { title_aux: 'Pack B' }],
  }, [{ id: 'exact-pack', title: 'Exact Pack', reference: 'https://github.com/owner/exact' }])

  it('prefers an embedded repository hint', () => {
    expect(resolveMissingNodes(['FancyNode'], [], [{ nodeType: 'FancyNode', repository: 'https://github.com/owner/exact' }], index)[0]).toMatchObject({ status: 'missing', candidates: [{ repository: 'https://github.com/owner/exact', exact: true }] })
  })

  it('resolves a registry id before falling back to node-name candidates', () => {
    expect(resolveMissingNodes(['FancyNode'], [], [{ nodeType: 'FancyNode', registryId: 'exact-pack' }], index)[0]).toMatchObject({ status: 'missing', candidates: [{ repository: 'https://github.com/owner/exact', exact: true }] })
  })

  it('keeps installed, ambiguous, and unknown matches explicit', () => {
    expect(resolveMissingNodes(['InstalledNode', 'FancyNode', 'UnknownNode'], ['InstalledNode'], [], index)).toEqual([
      expect.objectContaining({ nodeType: 'InstalledNode', status: 'installed' }),
      expect.objectContaining({ nodeType: 'FancyNode', status: 'ambiguous' }),
      expect.objectContaining({ nodeType: 'UnknownNode', status: 'unknown' }),
    ])
  })

  it('caches official documents and uses valid cache when refresh fails', async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), 'baka-node-map-'))
    roots.push(dataRoot)
    const extensionMap = { 'https://github.com/acme/pack': [['FancyNode'], { title_aux: 'Pack' }] }
    const customList = [{ id: 'pack', reference: 'https://github.com/acme/pack' }]
    let requests = 0
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => (++requests === 1 ? extensionMap : customList) })))
    const first = await loadDependencyMap(dataRoot, { now: 1 })
    expect(first.nodeNames.get('FancyNode')).toHaveLength(1)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const cached = await loadDependencyMap(dataRoot, { now: 2 * 24 * 60 * 60 * 1000, force: true })
    expect(cached.registryIds.get('pack')).toHaveLength(1)
  })
})

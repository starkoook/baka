import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { saveAutosave, loadAutosave, recordRecent, listRecent, removeRecent } from '../workflow-store'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'baka-wf-store-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('workflow-store autosave', () => {
  it('saves and loads autosave content', () => {
    const res = saveAutosave('{"version":1}', root)
    expect(res.success).toBe(true)
    expect(existsSync(join(root, 'workflows', 'autosave.bakaflow.json'))).toBe(true)
    const loaded = loadAutosave(root)
    expect(loaded.success).toBe(true)
    expect(loaded.content).toBe('{"version":1}')
  })

  it('returns failure when no autosave exists', () => {
    expect(loadAutosave(root).success).toBe(false)
  })
})

describe('workflow & assets IPC wiring', () => {
  it('registers both modules in main and exposes APIs in preload', () => {
    const { readFileSync } = require('node:fs')
    const { resolve } = require('node:path')
    const main = readFileSync(resolve(process.cwd(), 'electron/main.js'), 'utf8')
    expect(main).toContain("require('./ipc/workflow-store')")
    expect(main).toContain("require('./ipc/assets')")
    expect(main).toContain('registerWorkflowHandlers()')
    expect(main).toContain('registerAssetHandlers()')

    const preload = readFileSync(resolve(process.cwd(), 'electron/preload.js'), 'utf8')
    expect(preload).toContain("exposeInMainWorld('workflowAPI'")
    expect(preload).toContain("exposeInMainWorld('assetsAPI'")

    const env = readFileSync(resolve(process.cwd(), 'src/env.d.ts'), 'utf8')
    expect(env).toContain('interface WorkflowAPI')
    expect(env).toContain('interface AssetsAPI')
    expect(env).toContain('workflowAPI: WorkflowAPI')
    expect(env).toContain('assetsAPI: AssetsAPI')
  })
})

describe('workflow-store recent', () => {
  it('records newest first and caps at 20', () => {
    for (let i = 0; i < 25; i++) recordRecent({ path: `C:/flows/${i}.json`, name: `flow ${i}` }, root)
    const list = listRecent(root)
    expect(list).toHaveLength(20)
    expect(list[0].path).toBe('C:/flows/24.json')
  })

  it('deduplicates by path keeping the newest name', () => {
    recordRecent({ path: 'a.json', name: 'a' }, root)
    recordRecent({ path: 'a.json', name: 'a2' }, root)
    const list = listRecent(root)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('a2')
  })

  it('removes recent entries', () => {
    recordRecent({ path: 'a.json', name: 'a' }, root)
    const res = removeRecent('a.json', root)
    expect(res.success).toBe(true)
    expect(res.list).toHaveLength(0)
  })
})

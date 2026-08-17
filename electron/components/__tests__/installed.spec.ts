// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const { getManagedRuntime } = require(resolve('electron/components/installed.js'))

describe('managed runtime lookup', () => {
  it('returns only the runtime recorded by the component manager', () => {
    const root = mkdtempSync(join(tmpdir(), 'baka-runtime-'))
    const runtime = join(root, 'runtimes', 'standard', 'versions', 'v1')
    mkdirSync(join(runtime, 'python'), { recursive: true })
    writeFileSync(join(runtime, 'python', 'python.exe'), '')
    writeFileSync(join(root, 'component-state.json'), JSON.stringify({ installed: { 'runtime-standard': { version: 'v1', path: runtime } } }))

    expect(getManagedRuntime(root, 'standard')).toMatchObject({ id: 'standard', version: 'v1', path: runtime })
    expect(getManagedRuntime(root, 'blackwell')).toBeNull()
  })
})

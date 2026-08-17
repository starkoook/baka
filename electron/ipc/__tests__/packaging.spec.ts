import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('private distribution packaging', () => {
  it('keeps the installer lightweight without a public update provider', () => {
    const config = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8')

    expect(config).toContain('Baka-TOOLS-Setup.${ext}')
    expect(config).not.toContain('.cache/trainer-core')
    expect(config).not.toContain('to: trainer-core')
    expect(config).toContain('electron/**/*.py')
    expect(config).not.toContain('provider: github')
    expect(config).not.toContain('publish:')
  })

  it('builds components separately and writes the local release manifest', () => {
    const packageScript = readFileSync(resolve(process.cwd(), 'scripts/package.js'), 'utf8')

    expect(packageScript).not.toContain('prepare-trainer-core.js')
    expect(packageScript).toContain('create-release-manifest.js')
    expect(packageScript).not.toContain("'.cmd'")
    expect(packageScript).toContain("'vite', 'bin', 'vite.js'")
    expect(existsSync(resolve(process.cwd(), 'scripts/build-local-component-source.js'))).toBe(true)
    expect(existsSync(resolve(process.cwd(), 'scripts/verify-local-component-source.js'))).toBe(true)
    const componentScript = readFileSync(resolve(process.cwd(), 'scripts/build-local-component-source.js'), 'utf8')
    expect(componentScript).toContain("channel: 'local-test'")
    expect(componentScript).toContain("'runtime-standard'")
    expect(componentScript).toContain('sha256')
    expect(existsSync(resolve(process.cwd(), 'THIRD_PARTY_NOTICES.md'))).toBe(true)
  })
})

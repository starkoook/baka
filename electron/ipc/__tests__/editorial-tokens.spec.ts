import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const variables = read('src/styles/variables.css')
const global = read('src/styles/global.css')
const components = read('src/styles/components.css')
const appStore = read('src/stores/app.ts')

describe('editorial visual foundation', () => {
  it('defines semantic editorial tokens while preserving legacy aliases', () => {
    for (const token of [
      '--app-bg',
      '--surface-primary',
      '--surface-secondary',
      '--surface-selected',
      '--ink-primary',
      '--ink-secondary',
      '--ink-tertiary',
      '--brand-primary',
      '--brand-hover',
      '--brand-soft',
      '--action-accent',
      '--line-subtle',
      '--line-strong',
      '--surface-shadow',
      '--radius-control',
      '--radius-panel',
      '--radius-hero',
    ]) {
      expect(variables).toContain(token)
    }

    expect(variables).toMatch(/--bg-primary:\s*var\(--app-bg\)/)
    expect(variables).toMatch(/--text-primary:\s*var\(--ink-primary\)/)
    expect(variables).toMatch(/--accent-primary:\s*var\(--brand-primary\)/)
    expect(variables).toMatch(/--border-default:\s*var\(--line-subtle\)/)
  })

  it('removes decorative global effects but preserves accessible motion defaults', () => {
    for (const selector of ['.bg-grid', 'theme-wiping', 'sakura-global', 'scanlines', 'sparkles']) {
      expect(global).not.toContain(selector)
    }

    expect(global).toContain(':focus-visible')
    expect(global).toContain('prefers-reduced-motion: reduce')
  })

  it('uses compact shared controls without paw effects or scaling', () => {
    expect(components).not.toContain('.btn-primary::before')
    expect(components).not.toContain('.btn-primary::after')
    expect(components).not.toContain('transform: scale(1.05)')
    expect(components).toContain('--radius-control')
    expect(components).toContain('.btn')
    expect(components).toContain('.btn-primary')
    expect(components).toContain('.form-input')
    expect(components).toContain('.form-select')
  })

  it('changes theme directly without a wipe class or timer', () => {
    expect(appStore).not.toContain('theme-wiping')
    expect(appStore).toMatch(/function toggleTheme\(\)\s*{\s*setTheme\(theme\.value === 'dark' \? 'light' : 'dark'\)\s*}/)
  })
})

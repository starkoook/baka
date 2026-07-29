import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const blockFor = (source: string, selector: string) => {
  const selectorStart = source.indexOf(selector)
  if (selectorStart < 0) throw new Error(`Missing selector: ${selector}`)

  const openingBrace = source.indexOf('{', selectorStart)
  let depth = 0
  for (let index = openingBrace; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(selectorStart, index + 1)
  }

  throw new Error(`Unclosed selector: ${selector}`)
}

const semanticTokens = [
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
]

const variables = read('src/styles/variables.css')
const global = read('src/styles/global.css')
const components = read('src/styles/components.css')
const appStore = read('src/stores/app.ts')

describe('editorial visual foundation', () => {
  it('defines semantic editorial tokens while preserving legacy aliases', () => {
    const darkTheme = blockFor(variables, ':root')
    const lightTheme = blockFor(variables, '[data-theme="light"]')

    for (const theme of [darkTheme, lightTheme]) {
      for (const token of semanticTokens) {
        expect(theme).toContain(`${token}:`)
      }
      expect(theme).toContain('--radius-control: 8px')
    }

    expect(variables).toMatch(/--bg-primary:\s*var\(--app-bg\)/)
    expect(variables).toMatch(/--text-primary:\s*var\(--ink-primary\)/)
    expect(variables).toMatch(/--accent-primary:\s*var\(--brand-primary\)/)
    expect(variables).toMatch(/--border-default:\s*var\(--line-subtle\)/)
  })

  it('removes decorative global effects while preserving base and motion rules', () => {
    for (const selector of [
      '.bg-grid',
      'theme-wiping',
      'sakura-global',
      'scanlines',
      'sparkles',
      'core-glow',
      'ambient-glow',
      'noise-layer',
    ]) {
      expect(global).not.toContain(selector)
    }

    expect(global).toContain('box-sizing')
    expect(global).toContain('font-family')
    expect(global).toContain('overflow')
    expect(global).toContain('::-webkit-scrollbar')
    expect(global).toContain(':focus-visible')
    expect(global).toContain('prefers-reduced-motion: reduce')
    expect(global).toContain('180ms')
    expect(global).toContain('translateY(6px)')
  })

  it('uses compact shared controls without paw effects or scaling', () => {
    expect(components).not.toContain('.btn-primary::before')
    expect(components).not.toContain('.btn-primary::after')
    const buttonBlocks = [
      '.btn {',
      '.btn-primary {',
      '.btn-primary:hover {',
      '.btn-primary:active {',
      '.btn-primary:disabled {',
      '.btn-secondary {',
      '.btn-secondary:hover {',
      '.btn-secondary:disabled {',
      '.btn-ghost {',
      '.btn-ghost:hover {',
    ].map((selector) => blockFor(components, selector))

    for (const button of buttonBlocks) {
      expect(button).not.toContain('box-shadow')
      expect(button).not.toContain('glow')
      expect(button).not.toMatch(/transform:\s*scale/)
    }

    expect(blockFor(components, '.btn {')).toContain('var(--radius-control)')
    expect(blockFor(components, '.form-select,')).toContain('var(--radius-control)')
    expect(blockFor(components, '.form-range {')).toContain('var(--radius-control)')
    expect(components).toContain('.data-table')
    expect(components).toContain('.chip')
    expect(components).toContain('.cabin-panel')
  })

  it('changes theme directly without a wipe class or timer', () => {
    expect(appStore).not.toContain('theme-wiping')
    expect(appStore).toMatch(/function toggleTheme\(\)\s*{\s*setTheme\(theme\.value === 'dark' \? 'light' : 'dark'\)\s*}/)
  })
})

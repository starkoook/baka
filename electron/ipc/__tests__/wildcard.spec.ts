import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WildcardEngine } from '../wildcard.js'

describe('wildcard engine', () => {
  it('loads option files and ignores comments', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-wildcard-'))
    writeFileSync(join(dir, 'hair.txt'), '# comment\nlong hair\nshort hair\n', 'utf8')

    const engine = await WildcardEngine.load(dir)
    expect(engine.entries.hair).toHaveLength(2)
  })

  it('expands a token deterministically for the same seed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-wildcard-'))
    writeFileSync(join(dir, 'hair.txt'), 'long hair\nshort hair\n', 'utf8')

    const engine = await WildcardEngine.load(dir)
    const first = engine.expand('__hair__', { seed: 7, weightFormat: 'sd' })
    const second = engine.expand('__hair__', { seed: 7, weightFormat: 'sd' })

    expect(['long hair', 'short hair']).toContain(first.text)
    expect(second.text).toBe(first.text)
  })

  it('expands multiple picks with the @count suffix', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-wildcard-'))
    writeFileSync(join(dir, 'hair.txt'), 'long hair\nshort hair\npink hair\n', 'utf8')

    const engine = await WildcardEngine.load(dir)
    const result = engine.expand('__hair@3__', { seed: 2, weightFormat: 'sd' })

    expect(result.text.split(', ')).toHaveLength(3)
  })

  it('stores and reuses variables with the @name suffix', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-wildcard-'))
    writeFileSync(join(dir, 'hair.txt'), 'long hair\nshort hair\n', 'utf8')

    const engine = await WildcardEngine.load(dir)
    const result = engine.expand('__hair@x__, __@x__', { seed: 3, weightFormat: 'sd' })
    const parts = result.text.split(', ')

    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe(parts[1])
  })

  it('renders option weights in the requested format', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-wildcard-'))
    writeFileSync(join(dir, 'hair.txt'), 'pink hair|1.2\n', 'utf8')

    const engine = await WildcardEngine.load(dir)
    const result = engine.expand('__hair__', { seed: 1, weightFormat: 'naiNumeric' })

    expect(result.text).toBe('1.2::pink hair::')
  })
})

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { parseMediaUrl } = require('../media-protocol.js') as {
  parseMediaUrl: (url: string, platform?: string, existsSync?: (p: string) => boolean) => string
}

describe('media:// path parser', () => {
  it('keeps # and ? in Windows filenames (new URL would truncate)', () => {
    expect(parseMediaUrl('media:///C:/pics/foo#1.png', 'win32')).toBe('C:/pics/foo#1.png')
    expect(parseMediaUrl('media:///C:/pics/bar?.webp', 'win32')).toBe('C:/pics/bar?.webp')
  })

  it('keeps # and ? in POSIX filenames', () => {
    expect(parseMediaUrl('media:///home/user/foo#1.png', 'linux')).toBe('/home/user/foo#1.png')
    expect(parseMediaUrl('media:///home/user/bar?.webp', 'linux')).toBe('/home/user/bar?.webp')
  })

  it('decodes percent-encoded segments', () => {
    expect(parseMediaUrl('media:///C:/pics/spaced%20name.png', 'win32')).toBe('C:/pics/spaced name.png')
    expect(parseMediaUrl('media:///tmp/spaced%20name.png', 'linux')).toBe('/tmp/spaced name.png')
  })

  it('strips a leading slash on Windows when the rest is a drive path', () => {
    expect(parseMediaUrl('media:///C:/Users/x/a.png', 'win32')).toBe('C:/Users/x/a.png')
  })

  it('strips a leading slash on POSIX only when that unprefixed path exists', () => {
    const exists = (p: string) => p === 'tmp/only.png'
    expect(parseMediaUrl('media:///tmp/only.png', 'linux', exists)).toBe('tmp/only.png')
    expect(parseMediaUrl('media:///tmp/missing.png', 'linux', exists)).toBe('/tmp/missing.png')
  })
})

describe('media protocol hook', () => {
  it('is re-installed from cache handlers after main.js protocol.handle', () => {
    const cache = readFileSync(resolve(process.cwd(), 'electron/ipc/cache.js'), 'utf8')
    expect(cache).toContain("require('./media-protocol')")
    expect(cache).toContain('installMediaProtocol()')
  })
})

import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { collectImageEntries } from '../walk-images.js'

function dirent(name: string, directory: boolean) {
  return { name, isDirectory: () => directory, isFile: () => !directory }
}

describe('collectImageEntries', () => {
  it('yields to the event loop while walking a large tree', async () => {
    const tree: Record<string, ReturnType<typeof dirent>[]> = {
      root: [
        dirent('a', true),
        dirent('b', true),
        dirent('cover.png', false),
      ],
      [path.join('root', 'a')]: Array.from({ length: 30 }, (_, i) => dirent(`a${i}.jpg`, false)),
      [path.join('root', 'b')]: Array.from({ length: 30 }, (_, i) => dirent(`b${i}.png`, false)),
    }
    const yieldFn = vi.fn(async () => {})

    const entries = await collectImageEntries('root', {
      readdir: async (dir) => tree[dir] || [],
      stat: async () => ({ size: 12, mtime: new Date('2026-09-21T00:00:00Z') }),
      yieldEvery: 20,
      yieldFn,
    })

    expect(entries).toHaveLength(61)
    expect(entries).toContainEqual(expect.objectContaining({ filename: 'cover.png', dirname: 'root' }))
    expect(yieldFn.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('skips non-image files and unreadable directories', async () => {
    const entries = await collectImageEntries('root', {
      readdir: async (dir) => {
        if (dir === 'root') return [
          dirent('notes.txt', false),
          dirent('locked', true),
          dirent('ok.webp', false),
        ]
        throw new Error('EACCES')
      },
      stat: async () => ({ size: 8, mtime: new Date('2026-09-21T00:00:00Z') }),
      yieldEvery: 100,
      yieldFn: async () => {},
    })

    expect(entries.map((entry) => entry.filename)).toEqual(['ok.webp'])
  })
})

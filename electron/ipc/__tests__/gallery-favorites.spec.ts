import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dataRoot = mkdtempSync(join(tmpdir(), 'baka-fav-'))
process.env.BAKA_DATA_ROOT = dataRoot

let gallery: typeof import('../gallery.js')

beforeAll(async () => {
  gallery = await import('../gallery.js')
  await gallery.initDb(dataRoot)
})

afterAll(() => {
  rmSync(dataRoot, { recursive: true, force: true })
  delete process.env.BAKA_DATA_ROOT
})

describe('gallery favorites schema', () => {
  it('migrates to schema v8 with an indexed favorite column that defaults to 0', () => {
    const columns = gallery.queryAll('PRAGMA table_info(images)').map((row: { name: string }) => row.name)
    expect(columns).toContain('favorite')
    const version = gallery.queryOne('SELECT MAX(version) as version FROM schema_version')
    expect(version.version).toBeGreaterThanOrEqual(8)

    gallery.runSql(
      "INSERT INTO images (path, filename, dirname, root_id, width, height, file_size, file_modified_at, indexed_at, thumb_hash) VALUES ('D:/pics/a.png', 'a.png', 'D:/pics', NULL, 10, 10, 1, '2026-01-01', datetime('now'), NULL)",
    )
    const inserted = gallery.queryOne("SELECT id, favorite FROM images WHERE filename = 'a.png'")
    expect(inserted.favorite).toBe(0)

    gallery.runSql('UPDATE images SET favorite = 1 WHERE id = ?', [inserted.id])
    expect(gallery.queryOne('SELECT COUNT(*) as count FROM images WHERE favorite = 1').count).toBe(1)
    // 最近 7 天入库 + 没有任何标签 → 两个侧栏计数都能算出来
    expect(gallery.queryOne("SELECT COUNT(*) as count FROM images WHERE indexed_at >= datetime('now', '-7 days')").count).toBe(1)
    expect(gallery.queryOne('SELECT COUNT(*) as count FROM images WHERE NOT EXISTS (SELECT 1 FROM image_tags WHERE image_tags.image_id = images.id)').count).toBe(1)
  })
})

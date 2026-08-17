import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TagCatalog } from '../tag-catalog.js'

describe('tag catalog', () => {
  it('finds english tags by chinese name and resolves parents', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-catalog-'))
    const zhPath = join(dir, 'zh.csv')
    const charPath = join(dir, 'chars.csv')
    writeFileSync(zhPath, 'english_tag,chinese_name\nblue_hair,蓝色头发\nlong_hair,长发\n', 'utf8')
    writeFileSync(charPath, 'character_tag,other_names,copyright,parent_tag,post_count\nracing_miku,,,hatsune_miku,10\n', 'utf8')

    const catalog = await TagCatalog.load({ zhPath, characterPath: charPath })

    expect(catalog.searchChinese('蓝色长发')).toContainEqual(expect.objectContaining({ tag: 'blue_hair' }))
    expect(catalog.getParent('racing_miku')).toBe('hatsune_miku')
    expect(catalog.getChildren('hatsune_miku')).toContain('racing_miku')
  })
})

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TagCatalog } from '../tag-catalog.js'

describe('tag translation', () => {
  it('translates english to chinese and back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-translate-'))
    const zhPath = join(dir, 'zh.csv')
    const charPath = join(dir, 'chars.csv')
    writeFileSync(zhPath, 'english_tag,chinese_name\nblue_hair,蓝色头发\n', 'utf8')
    writeFileSync(charPath, 'character_tag,other_names,copyright,parent_tag,post_count\nhatsune_miku,,,,\n', 'utf8')

    const catalog = await TagCatalog.load({ zhPath, characterPath: charPath })

    expect(catalog.translateTags(['blue_hair', 'unknown'], 'en2zh')).toEqual([
      { tag: 'blue_hair', translation: '蓝色头发', found: true },
      { tag: 'unknown', translation: '', found: false },
    ])
    expect(catalog.translateTags(['蓝色头发'], 'zh2en')).toEqual([
      { tag: '蓝色头发', translation: 'blue_hair', found: true },
    ])
  })
})

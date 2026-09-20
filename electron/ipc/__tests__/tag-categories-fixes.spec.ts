import { describe, expect, it } from 'vitest'
import { classifyTag, classifyTags, sortByCategory, PRIMARY_ORDER } from '../tag-categories.js'
import { applyPlan, planSubjectCount, planTagFixes } from '../tag-fixes.js'
import { tagDataPath } from '../tag-data-path.js'
import fs from 'node:fs'

describe('tag categories', () => {
  it('ships the category catalog and resolves it through tag-data-path', () => {
    expect(fs.existsSync(tagDataPath('danbooru_general_categories.csv'))).toBe(true)
    expect(fs.existsSync(tagDataPath('danbooru-0-zh.csv'))).toBe(true)
  })

  it('classifies catalog tags, underscore or space, and falls back to suffix rules', () => {
    expect(classifyTag('long_hair')).toMatchObject({ l1: '头发', source: 'catalog' })
    expect(classifyTag('long hair').l1).toBe('头发')
    expect(classifyTag('blue eyes').l1).toBe('眼睛')
    expect(classifyTag('1girl').l1).toBe('人数')
    expect(classifyTag('hatsune miku (cosplay)').l1).toBe('cosplay')
    expect(classifyTag('zzz made up shirt')).toMatchObject({ l1: '服装', source: 'rule' })
    expect(classifyTag('totally unknown thing')).toMatchObject({ l1: '一般', source: 'none' })
    expect(classifyTag('some new character', { wd14Category: '角色' })).toMatchObject({ l1: '角色', source: 'hint' })
    expect(classifyTags(['1girl', { tag: 'smile' }])['smile'].l1).toBe('表情')
  })

  it('sorts by primary category while keeping the first N tags pinned', () => {
    const sorted = sortByCategory(['miku', 'black boots', 'smile', '1girl', 'long hair', 'blue eyes'], 1)
    expect(sorted[0]).toBe('miku')
    expect(sorted.slice(1)).toEqual(['1girl', 'long hair', 'blue eyes', 'smile', 'black boots'])
    expect(PRIMARY_ORDER[0]).toBe('角色')
  })
})

describe('tag fixes', () => {
  it('resolves subject-count conflicts per gender and strips solo from multi-person images', () => {
    const removals = planSubjectCount(['1girl', '2girls', '1boy', 'solo', 'solo focus'])
    expect(removals.map((entry) => entry.tag)).toEqual(['1girl', 'solo'])
    expect(planSubjectCount(['1girl', 'solo', 'solo focus'])).toEqual([])
    expect(planSubjectCount(['1girl', 'multiple girls', 'solo']).map((entry) => entry.tag)).toEqual(['solo'])
  })

  it('votes between character variants and merges rare children into parents', () => {
    const parentByChild = new Map([['racing_miku', 'hatsune_miku'], ['hatsune_miku_(append)', 'hatsune_miku']])
    const items = [
      { path: 'a.png', tags: ['hatsune miku', 'racing miku', '1girl'] },
      { path: 'b.png', tags: ['hatsune miku', '1girl'] },
      { path: 'c.png', tags: ['hatsune miku', '1girl'] },
      { path: 'd.png', tags: ['hatsune_miku_(append)', '1girl'] },
    ]
    const plans = planTagFixes(items, { parentByChild, childThreshold: 2 })
    const a = plans.find((plan) => plan.path === 'a.png')!
    expect(a.remove.map((entry) => entry.tag)).toEqual(['racing miku'])
    const d = plans.find((plan) => plan.path === 'd.png')!
    expect(d.remove[0].tag).toBe('hatsune_miku_(append)')
    expect(d.add[0].tag).toBe('hatsune miku')
    expect(applyPlan(items[3].tags, d)).toEqual(['1girl', 'hatsune miku'])
    expect(plans.find((plan) => plan.path === 'b.png')).toBeUndefined()
    // 关闭角色修复时只处理人数
    expect(planTagFixes(items, { parentByChild, fixCharacterVariants: false })).toEqual([])
  })
})

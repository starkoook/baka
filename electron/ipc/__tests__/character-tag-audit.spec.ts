import { describe, expect, it } from 'vitest'
import {
  applyInventoryDecisions,
  auditInventory,
  buildCorePrompt,
  buildSystemPrompt,
  buildTextPrompt,
  buildVisualPrompt,
  buildInventory,
  buildPyramidPrompt,
  loadSkills,
  parsePyramidOutput,
  parseSkillDecisions,
} from '../character-tag-audit.js'

const inventory = [
  { tag: 'chisa (peach parfait)', count: 40, paths: [] },
  { tag: '1girl', count: 40, paths: [] },
  { tag: 'hat', count: 22, paths: [] },
  { tag: 'white headwear', count: 19, paths: [] },
  { tag: 'white hair', count: 30, paths: [] },
  { tag: 'looking at viewer', count: 33, paths: [] },
  { tag: 'sitting', count: 12, paths: [] },
]
const trigger = ['chisa (peach parfait)']

function answer(rows: Array<Record<string, unknown>>) {
  return JSON.stringify({ tags: rows })
}

describe('character tag audit', () => {
  it('builds a tag inventory', () => {
    const built = buildInventory([
      { path: 'a.png', tags: ['1girl', 'blue_hair'] },
      { path: 'b.png', tags: ['1girl', 'red_hair'] },
    ])
    expect(built.find((item) => item.tag === '1girl').count).toBe(2)
  })

  it('applies decisions', () => {
    const items = [
      { path: 'a.png', tags: ['1girl', 'blue_hair'] },
      { path: 'b.png', tags: ['2girls', 'solo'] },
    ]
    const applied = applyInventoryDecisions(items, [
      { tag: 'blue_hair', type: 'replace', target: 'aqua_hair' },
      { tag: 'solo', type: 'delete' },
    ])
    expect(applied[0].tags).toEqual(['1girl', 'aqua_hair'])
    expect(applied[1].tags).toEqual(['2girls'])
  })

  it('applies parentByChild when merging child tags', () => {
    const items = [{ path: 'a.png', tags: ['hatsune_miku_(append)', 'hatsune_miku'] }]
    const applied = applyInventoryDecisions(items, [], new Map([['hatsune_miku_(append)', 'hatsune_miku']]))
    expect(applied[0].tags).toEqual(['hatsune_miku'])
  })

  it('ships both skills and injects them into the system prompt with the strict schema', () => {
    const skills = loadSkills()
    expect(skills.auditor).toContain('Character LoRA Tag Auditor')
    expect(skills.pyramid).toContain('Prompt Pyramid')
    expect(skills.auditor.startsWith('---')).toBe(false)
    const system = buildSystemPrompt({ mode: 'full', skills })
    expect(system).toContain('Full style')
    expect(system).toContain('"decision":"keep|delete|replace|uncertain"')
    expect(system).toContain(skills.auditor.slice(0, 60))
    expect(buildTextPrompt({ triggerWords: trigger, inventory, mode: 'sparse' })).toContain('"tag":"hat","count":22')
  })

  it('validates decisions the way BDTM+ does: coverage, replacements, protection, trigger, hair colors', () => {
    const decisions = parseSkillDecisions(answer([
      { tag: 'chisa (peach parfait)', decision: 'delete', category: 'clothing', include_in_prompt: false, prompt_order: 9 },
      { tag: '1girl', decision: 'delete', category: 'clothing', include_in_prompt: true, prompt_order: 1 },
      { tag: 'hat', decision: 'replace', replacement_tag: 'white hat', category: 'wearable_accessory', include_in_prompt: true, prompt_order: 6, reason: 'white hat visible' },
      { tag: 'white headwear', decision: 'replace', replacement_tag: 'white hat', category: 'wearable_accessory', include_in_prompt: true, prompt_order: 6 },
      { tag: 'white hair', decision: 'replace', replacement_tag: 'multicolored hair', category: 'hair', include_in_prompt: true, prompt_order: 4 },
      { tag: 'looking at viewer', decision: 'delete', category: 'composition', include_in_prompt: false, prompt_order: 99 },
      { tag: 'sitting', decision: 'replace', replacement_tag: 'seated', category: 'clothing', include_in_prompt: false, prompt_order: 99, reason: 'mislabelled by model' },
    ]), inventory, trigger)

    const byTag = Object.fromEntries(decisions.map((item) => [item.tag, item]))
    // 触发词永远保留、进 prompt、排在 0
    expect(byTag['chisa (peach parfait)']).toMatchObject({ decision: 'keep', type: 'keep', includeInPrompt: true, promptOrder: 0, category: 'identity' })
    // 主体数本地判定为 identity，模型说 clothing/delete 也回退为保留
    expect(byTag['1girl']).toMatchObject({ decision: 'keep', category: 'identity', includeInPrompt: true })
    // 合法替换保留，两个来源映射到同一个目标
    expect(byTag['hat']).toMatchObject({ decision: 'replace', type: 'replace', target: 'white hat' })
    expect(byTag['white headwear']).toMatchObject({ decision: 'replace', target: 'white hat' })
    // 具体发色 → 泛化多色词 被禁止
    expect(byTag['white hair']).toMatchObject({ decision: 'keep', target: '' })
    // 受保护类目不许删
    expect(byTag['looking at viewer']).toMatchObject({ decision: 'keep', includeInPrompt: false })
    // 模型把动作归到 clothing 想替换：本地没有兜底分类时按模型类目处理 —— 但 sitting 不在本地保护词表里，替换合法则保留替换
    expect(byTag['sitting'].decision).toBe('replace')

    expect(buildCorePrompt(decisions, trigger)).toBe('chisa (peach parfait), 1girl, white hair, white hat')
  })

  it('rejects incomplete coverage, unknown tags, duplicates, chains and bad targets', () => {
    expect(() => parseSkillDecisions(answer([{ tag: '1girl', decision: 'keep' }]), inventory.slice(0, 2), trigger)).toThrow(/cover every input tag/)
    expect(() => parseSkillDecisions(answer([{ tag: 'nope', decision: 'keep' }]), inventory.slice(1, 2), [])).toThrow(/unknown/)
    expect(() => parseSkillDecisions(answer([{ tag: '1girl', decision: 'keep' }, { tag: '1girl', decision: 'keep' }]), inventory.slice(1, 2), [])).toThrow(/duplicate/)
    expect(() => parseSkillDecisions(answer([{ tag: 'hat', decision: 'replace', replacement_tag: 'a, b', category: 'clothing' }]), inventory.slice(2, 3), [])).toThrow(/invalid replacement/)
    expect(() => parseSkillDecisions(answer([
      { tag: 'hat', decision: 'replace', replacement_tag: 'white headwear', category: 'clothing' },
      { tag: 'white headwear', decision: 'replace', replacement_tag: 'white hat', category: 'clothing' },
    ]), inventory.slice(2, 4), [])).toThrow(/chain or cycle/)
    expect(() => parseSkillDecisions('no json here', inventory.slice(1, 2), [])).toThrow(/no JSON/)
  })

  it('runs text screening, repairs a broken answer once, then reviews against the reference image', async () => {
    const prompts: { prompt: string; imagePaths: string[] }[] = []
    let call = 0
    const good = answer(inventory.map((item, index) => ({ tag: item.tag, decision: 'keep', category: index < 2 ? 'identity' : 'other', include_in_prompt: index < 2, prompt_order: index })))
    const result = await auditInventory({
      inventory,
      triggerWords: trigger,
      referenceImagePaths: ['C:/ref.png'],
      mode: 'sparse',
      requestLlm: async ({ prompt, imagePaths }) => {
        prompts.push({ prompt, imagePaths })
        call++
        if (call === 1) return 'garbage'
        return good
      },
    })
    expect(prompts).toHaveLength(3)
    expect(prompts[0].prompt).toContain('Trigger word (must keep): chisa (peach parfait)')
    expect(prompts[0].prompt).toContain('Character LoRA Tag Auditor')
    expect(prompts[1].prompt).toContain('could not be validated')
    expect(prompts[2].imagePaths).toEqual(['C:/ref.png'])
    expect(prompts[2].prompt).toContain('Review the preliminary tag decisions')
    expect(result.decisions).toHaveLength(inventory.length)
    expect(result.corePrompt).toBe('chisa (peach parfait), 1girl')
    expect(result.stages.map((stage) => stage.stage)).toEqual(['text', 'visual'])
  })

  it('keeps the text-stage result when the visual review fails and honours the minimum count', async () => {
    let call = 0
    const result = await auditInventory({
      inventory,
      triggerWords: trigger,
      referenceImagePaths: ['C:/ref.png'],
      minimumCount: 20,
      requestLlm: async () => {
        call++
        if (call === 1) return answer(inventory.filter((item) => item.count >= 20).map((item) => ({ tag: item.tag, decision: 'keep', category: 'other' })))
        return 'still garbage'
      },
    })
    expect(result.excluded.map((item) => item.tag)).toEqual(['white headwear', 'sitting'])
    expect(result.decisions.map((item) => item.tag)).not.toContain('sitting')
    expect(result.stages[1]).toMatchObject({ stage: 'visual' })
    expect(result.stages[1].error).toBeTruthy()
  })

  it('reorders tags with prompt-pyramid without dropping or inventing any', () => {
    const tags = ['black boots', 'smile', 'chisa (peach parfait)', 'pink_hair', '1girl', 'red eyes']
    expect(buildPyramidPrompt({ tags, triggerWords: ['chisa (peach parfait)'], skill: 'SKILL' })).toContain('Trigger word(s) that must come first')
    const { ordered, matched } = parsePyramidOutput('Sure!\nchisa (peach parfait), 1girl, red eyes, pink hair, (smile:1.2), unicorn, black boots', tags)
    expect(ordered).toEqual(['chisa (peach parfait)', '1girl', 'red eyes', 'pink_hair', 'smile', 'black boots'])
    expect(matched).toBe(6)
    const partial = parsePyramidOutput('1girl', tags)
    expect(partial.ordered).toHaveLength(6)
    expect(partial.ordered[0]).toBe('1girl')
  })
})

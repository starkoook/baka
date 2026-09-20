/**
 * 角色标签审计核心。
 * 规则来自 lora-tagging-skills（character-tag-auditor / prompt-pyramid，MIT），
 * 流程与校验参照 BooruDatasetTagManager+ 的 CharacterTagAudit：
 *   文本初筛 → （有参考图时）视觉复核 → 严格校验（每个标签恰好一次、替换合法、无替换链、受保护类目回退为保留）。
 */
const fs = require('fs')
const path = require('path')
const { fixSubjectCount, mergeChildTags } = require('./character-tag-decisions')

const SKILLS_DIR = path.join(__dirname, '..', 'skills')

function stripFrontmatter(text) {
  return String(text || '').replace(/^---[\s\S]*?---\s*/, '').trim()
}

function loadSkill(name) {
  try {
    return stripFrontmatter(fs.readFileSync(path.join(SKILLS_DIR, `${name}.md`), 'utf8'))
  } catch (_) {
    return ''
  }
}

function loadSkills() {
  return { auditor: loadSkill('character-tag-auditor'), pyramid: loadSkill('prompt-pyramid') }
}

const DELETABLE_CATEGORIES = new Set(['hair', 'eyes', 'face', 'body', 'clothing', 'footwear', 'legwear', 'wearable_accessory'])
const ALL_CATEGORIES = new Set([...DELETABLE_CATEGORIES, 'identity', 'action', 'pose', 'expression', 'scene', 'composition', 'quality', 'object', 'other'])
const GENERIC_HAIR_COLOR_TAGS = new Set([
  'colored hair', 'multicolored hair', 'two-tone hair', 'two tone hair', 'gradient hair',
  'streaked hair', 'split-color hair', 'split color hair', 'colored inner hair', 'rainbow hair',
])
const SUBJECT_COUNT = /^(\d+\s*\+?\s*(girls?|boys?|others?)|solo|solo focus|multiple (girls|boys|others)|no humans|everyone)$/
const QUALITY_TAGS = new Set([
  'masterpiece', 'best quality', 'high quality', 'highres', 'absurdres', 'lowres', 'worst quality', 'low quality',
  'very awa', 'newest', 'recent', 'old', 'oldest', 'amazing quality', 'great quality', 'normal quality',
])

function normalizeKey(tag) {
  return String(tag || '').trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
}

/** 本地兜底分类：主体数、画质词不许被模型归到可删类目里。 */
function localCategory(tag) {
  const key = normalizeKey(tag)
  if (SUBJECT_COUNT.test(key)) return 'identity'
  if (QUALITY_TAGS.has(key)) return 'quality'
  return null
}

function canDelete(category) {
  return DELETABLE_CATEGORIES.has(category)
}

function isValidReplacement(source, target) {
  const value = String(target || '').trim()
  if (!value) return false
  if (value === String(source || '').trim()) return false
  if (/[,\r\n]/.test(value)) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value)) return false
  return true
}

function isGenericHairColorTag(tag) {
  return GENERIC_HAIR_COLOR_TAGS.has(normalizeKey(tag))
}

function isForbiddenGenericHairReplacement(source, target) {
  return isGenericHairColorTag(target) && !isGenericHairColorTag(source)
}

function isTrigger(tag, triggerWords) {
  const key = normalizeKey(tag)
  return (triggerWords || []).some((word) => normalizeKey(word) === key)
}

// ── 库存 ──

function buildInventory(items) {
  const counts = new Map()
  const imagesByTag = new Map()
  for (const item of items || []) {
    for (const tag of item.tags || []) {
      const key = tag.toLowerCase()
      counts.set(key, (counts.get(key) || 0) + 1)
      if (!imagesByTag.has(key)) imagesByTag.set(key, [])
      imagesByTag.get(key).push(item.path)
    }
  }
  return [...counts.entries()].map(([tag, count]) => ({ tag, count, paths: imagesByTag.get(tag) || [] }))
}

function applyInventoryDecisions(items, decisions, parentByChild = new Map()) {
  const replaceMap = new Map()
  const deleteSet = new Set()
  for (const decision of decisions || []) {
    if (decision.type === 'replace' && decision.target) {
      replaceMap.set(decision.tag.toLowerCase(), decision.target)
    } else if (decision.type === 'delete') {
      deleteSet.add(decision.tag.toLowerCase())
    }
  }

  return (items || []).map(item => {
    let tags = item.tags || []
    tags = tags.filter(tag => !deleteSet.has(tag.toLowerCase()))
    tags = tags.map(tag => replaceMap.get(tag.toLowerCase()) || tag)
    tags = fixSubjectCount(tags)
    tags = mergeChildTags(tags, parentByChild)
    return { ...item, tags: [...new Set(tags)] }
  })
}

// ── 提示词 ──

const OUTPUT_SCHEMA = 'Output {"tags":[{"tag":string,"decision":"keep|delete|replace|uncertain",'
  + '"replacement_tag":string|null,"category":"identity|hair|eyes|face|body|clothing|footwear|legwear|wearable_accessory|action|pose|expression|scene|composition|quality|object|other",'
  + '"reason":string,"include_in_prompt":boolean,"prompt_order":integer}]}.'

function buildSystemPrompt({ mode = 'sparse', skills }) {
  const styleRule = mode === 'full'
    ? 'Full style: delete only incorrect/conflicting appearance details, keep real pattern/frill/material details, and replace only clearly redundant generic tags with visually verified normalized tags. '
    : 'Sparse style: delete incorrect/conflicting and non-core appearance details, including generic redundant, pattern, frill, ruffle, and material tags. Replace correct but imprecise clothing/headwear tags with visually verified normalized color+item tags. '
  return 'You are a strict character LoRA tag auditor. Follow both skills below. '
    + 'The character-auditor skill decides keep/delete/replace/uncertain. The prompt-pyramid skill orders the core final prompt. '
    + styleRule
    + 'Deletion and replacement are allowed only for hair, eyes, face, body, clothing, footwear, legwear, and wearable_accessory. '
    + 'Always keep identity, actions, poses, expressions, scenes, composition, quality, ordinary objects, and other categories. '
    + 'Return every original tag exactly once and never modify the tag field. Replacement targets belong only in replacement_tag. '
    + OUTPUT_SCHEMA + '\n\n'
    + (skills?.auditor || '') + '\n\n' + (skills?.pyramid || '')
}

function buildOtherCharactersHint(otherTriggers) {
  if (!otherTriggers || !otherTriggers.length) return ''
  return 'Other characters also appear in some of these images: ' + otherTriggers.join(', ')
    + '. Tags describing THOSE characters (their hair length/color, eye color, garments, accessories) '
    + 'must be decision=keep with include_in_prompt=false and a reason naming that character. '
    + 'Attribute every appearance tag strictly to the correct character; never assume a tag belongs '
    + 'to the locked character just because it is frequent.\n'
}

function buildTextPrompt({ triggerWords = [], inventory = [], mode = 'sparse', otherTriggers = [] }) {
  const inventoryJson = JSON.stringify(inventory.map((item) => ({ tag: item.tag, count: item.count })))
  return 'Audit every supplied tag using the requested style. Return strict JSON only.\n'
    + 'Trigger word (must keep): ' + (triggerWords.join(', ') || 'none') + '\n'
    + buildOtherCharactersHint(otherTriggers)
    + 'Style: ' + (mode === 'full' ? 'full' : 'sparse') + '\nTags: ' + inventoryJson
}

/** 无颜色的服装 / 鞋 / 腿部 / 配饰标签：视觉阶段必须逐个复核 */
const COLOR_WORDS = /^(black|white|red|blue|green|yellow|pink|purple|orange|brown|grey|gray|silver|gold|golden|aqua|teal|navy|beige|cream|lavender|crimson|maroon|violet|indigo|dark|light|pale|multicolored|two-tone|striped|plaid|checkered)\b/
function collectColorlessWearables(decisions) {
  return decisions
    .filter((item) => ['clothing', 'footwear', 'legwear', 'wearable_accessory'].includes(item.category))
    .filter((item) => item.decision !== 'delete')
    .map((item) => item.tag)
    .filter((tag) => !COLOR_WORDS.test(normalizeKey(tag)))
}

function buildVisualPrompt({ triggerWords = [], decisions = [], otherTriggers = [] }) {
  const colorless = collectColorlessWearables(decisions)
  const todo = colorless.length
    ? 'Color-less wearable tags you MUST resolve now: ' + colorless.join(', ')
      + '. For each: replace -> "<color> <tag>" when the reference shows the color, otherwise keep with a reason starting "color unverifiable:".\n'
    : ''
  const preliminary = JSON.stringify(decisions.map((item) => ({
    tag: item.tag,
    decision: item.decision,
    replacement_tag: item.target || '',
    category: item.category,
    reason: item.reason,
    include_in_prompt: item.includeInPrompt,
    prompt_order: item.promptOrder,
  })))
  return buildOtherCharactersHint(otherTriggers)
    + (otherTriggers.length ? `The attached reference image shows ONLY the locked character (${triggerWords.join(', ')}); use it as the sole authority for which features are theirs.\n` : '')
    + 'Review the preliminary tag decisions against the attached reference image. '
    + 'Return the same complete strict JSON schema. Replacement targets may be new normalized tags, '
    + 'but every original tag must still appear exactly once.\n'
    + 'Explicitly list and re-check every color-less garment, footwear, legwear, and wearable accessory tag '
    + '(for example jacket, boots, shirt, skirt, hair ribbon). When the reference clearly shows its color on '
    + 'the locked character, use replace with the color-prefixed tag (for example jacket -> black jacket) even '
    + 'if that colored tag does not exist anywhere in the inventory. Keep the color-less tag only when the '
    + 'color is genuinely unverifiable, and explain why in reason. Never answer replace with an empty replacement_tag.\n'
    + todo
    + 'Each reason must cite what you see in the reference (at least 8 words); stock phrases such as "core tag" or "required tag" are invalid.\n'
    + 'Preliminary: ' + preliminary
}

function buildRepairPrompt(previousRaw, error) {
  return 'Your previous answer could not be validated: ' + error + '\n'
    + 'Return the corrected strict JSON only, covering every original tag exactly once, with the same schema. '
    + 'If a replace target equals its source, use keep with an empty replacement_tag.\n'
    + 'Previous answer: ' + String(previousRaw || '').slice(0, 12000)
}

// ── 解析与校验 ──

class AuditResponseError extends Error {}

function extractJson(text) {
  const raw = String(text || '')
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw
  const start = fenced.indexOf('{')
  const arrayStart = fenced.indexOf('[')
  if (start >= 0 && (arrayStart < 0 || start < arrayStart)) {
    const end = fenced.lastIndexOf('}')
    if (end > start) return fenced.slice(start, end + 1)
  }
  if (arrayStart >= 0) {
    const end = fenced.lastIndexOf(']')
    if (end > arrayStart) return fenced.slice(arrayStart, end + 1)
  }
  throw new AuditResponseError('The model response contains no JSON.')
}

/**
 * 严格解析：每个库存标签恰好出现一次、决定合法、替换合法、无替换链；
 * 触发词永远保留且进 prompt；受保护类目的删改回退为保留。
 */
function parseSkillDecisions(raw, inventory, triggerWords = []) {
  let root
  try {
    root = JSON.parse(extractJson(raw))
  } catch (error) {
    if (error instanceof AuditResponseError) throw error
    throw new AuditResponseError('The model response is not valid JSON.')
  }
  const list = Array.isArray(root) ? root : root?.tags
  if (!Array.isArray(list)) throw new AuditResponseError('Response must contain a tags array.')

  const expected = new Map(inventory.map((item) => [normalizeKey(item.tag), item]))
  const seen = new Set()
  const parsed = new Map()

  for (const token of list) {
    if (!token || typeof token !== 'object') continue
    const tagText = String(token.tag || '').trim()
    const key = normalizeKey(tagText)
    if (!key || !expected.has(key)) throw new AuditResponseError(`Response contains an unknown or empty tag: "${tagText}"`)
    if (seen.has(key)) throw new AuditResponseError(`Response contains a duplicate tag: ${tagText}`)
    seen.add(key)
    const entry = expected.get(key)

    let decision = String(token.decision || '').trim().toLowerCase()
    if (!['keep', 'delete', 'replace', 'uncertain'].includes(decision)) throw new AuditResponseError(`Response contains an invalid decision for: ${tagText}`)

    const modelCategory = String(token.category || '').trim().toLowerCase()
    const local = localCategory(entry.tag)
    let category = local || (ALL_CATEGORIES.has(modelCategory) ? modelCategory : 'other')

    let target = token.replacement_tag == null ? '' : String(token.replacement_tag).trim()
    if (decision === 'replace' && normalizeKey(target) === key) { decision = 'keep'; target = '' }
    if (decision === 'replace' && !isValidReplacement(entry.tag, target)) throw new AuditResponseError(`Response contains an invalid replacement: ${tagText} -> ${target || '(empty)'}`)

    let includeInPrompt = token.include_in_prompt === true
    let promptOrder = Number.isFinite(Number(token.prompt_order)) ? Number(token.prompt_order) : Number.MAX_SAFE_INTEGER
    if (isTrigger(entry.tag, triggerWords)) {
      decision = 'keep'; target = ''; includeInPrompt = true; promptOrder = 0; category = 'identity'
    }
    if ((decision === 'delete' || decision === 'replace') && !canDelete(category)) { decision = 'keep'; target = '' }
    if (decision === 'replace' && isForbiddenGenericHairReplacement(entry.tag, target)) { decision = 'keep'; target = '' }
    if (decision === 'delete') includeInPrompt = false
    if (!canDelete(category) && category !== 'identity') includeInPrompt = false

    parsed.set(key, {
      tag: entry.tag,
      count: entry.count,
      decision,
      type: decision === 'uncertain' ? 'unsure' : decision,
      target: decision === 'replace' ? target : '',
      category,
      reason: token.reason ? String(token.reason).trim() : '',
      includeInPrompt,
      promptOrder,
    })
  }

  if (seen.size !== expected.size) throw new AuditResponseError('Response does not cover every input tag.')

  const result = inventory.map((item) => parsed.get(normalizeKey(item.tag)))
  const sources = new Set(result.filter((item) => item.decision === 'replace').map((item) => normalizeKey(item.tag)))
  if (result.some((item) => item.decision === 'replace' && sources.has(normalizeKey(item.target)))) {
    throw new AuditResponseError('Response contains a replacement chain or cycle.')
  }
  return result
}

/** 角色核心 prompt：进 prompt 的标签按 prompt_order 排，替换过的用替换词，去重。 */
function buildCorePrompt(decisions, triggerWords = []) {
  const chosen = (decisions || [])
    .filter((item) => item.includeInPrompt && item.decision !== 'delete' && item.decision !== 'uncertain')
    .map((item) => ({ text: item.decision === 'replace' && item.target ? item.target : item.tag, order: item.promptOrder ?? Number.MAX_SAFE_INTEGER }))
  for (const word of triggerWords) {
    if (!chosen.some((item) => normalizeKey(item.text) === normalizeKey(word))) chosen.unshift({ text: word, order: 0 })
  }
  chosen.sort((a, b) => a.order - b.order)
  const seen = new Set()
  const out = []
  for (const item of chosen) {
    const key = normalizeKey(item.text)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item.text.trim())
  }
  return out.join(', ')
}

// ── 主流程 ──

async function requestValidated({ requestLlm, prompt, imagePaths, inventory, triggerWords }) {
  let raw = await requestLlm({ prompt, imagePaths })
  try {
    return { decisions: parseSkillDecisions(raw, inventory, triggerWords), raw }
  } catch (error) {
    if (!(error instanceof AuditResponseError)) throw error
    // 一次修复请求：把错误和原答案一起发回去，让模型改正
    const repaired = await requestLlm({ prompt: buildRepairPrompt(raw, error.message), imagePaths: [] })
    return { decisions: parseSkillDecisions(repaired, inventory, triggerWords), raw: repaired }
  }
}

/**
 * @param requestLlm  ({ prompt, imagePaths }) => Promise<string>  返回模型原始文本
 */
async function auditInventory({
  inventory,
  triggerWords = [],
  referenceImagePaths = [],
  requestLlm,
  mode = 'sparse',
  minimumCount = 1,
  otherTriggers = [],
  skills,
}) {
  if (!requestLlm) throw new Error('requestLlm is required')
  const loaded = skills || loadSkills()
  if (!loaded.auditor) throw new Error('缺少 character-tag-auditor 规则文件（electron/skills）')

  const excluded = (inventory || []).filter((item) => item.count < minimumCount)
  const audited = (inventory || []).filter((item) => item.count >= minimumCount)
  if (!audited.length) return { decisions: [], excluded, corePrompt: buildCorePrompt([], triggerWords), stages: [] }

  const system = buildSystemPrompt({ mode, skills: loaded })
  const stages = []

  const text = await requestValidated({
    requestLlm,
    prompt: system + '\n\n' + buildTextPrompt({ triggerWords, inventory: audited, mode, otherTriggers }),
    imagePaths: [],
    inventory: audited,
    triggerWords,
  })
  stages.push({ stage: 'text', raw: text.raw })
  let decisions = text.decisions

  if (referenceImagePaths.length) {
    try {
      const visual = await requestValidated({
        requestLlm,
        prompt: system + '\n\n' + buildVisualPrompt({ triggerWords, decisions, otherTriggers }),
        imagePaths: referenceImagePaths,
        inventory: audited,
        triggerWords,
      })
      stages.push({ stage: 'visual', raw: visual.raw })
      decisions = visual.decisions
    } catch (error) {
      // 视觉复核失败就用文本阶段的结果，不让整次审计白跑
      stages.push({ stage: 'visual', error: error.message })
    }
  }

  return {
    decisions,
    excluded,
    corePrompt: buildCorePrompt(decisions, triggerWords),
    stages,
    // 兼容旧调用方
    textResult: decisions,
  }
}

// ── prompt-pyramid：把一张图的标签排成金字塔顺序 ──

function buildPyramidPrompt({ tags, triggerWords = [], skill }) {
  return (skill || loadSkill('prompt-pyramid')) + '\n\n'
    + 'Reorder the following comma-separated tags into one clean prompt line following the pyramid. '
    + 'Use ONLY tags from the input (you may lowercase them and replace underscores with spaces); do not add, translate, or invent tags. '
    + 'Remove exact duplicates only. Output the single line and nothing else.\n'
    + (triggerWords.length ? 'Trigger word(s) that must come first: ' + triggerWords.join(', ') + '\n' : '')
    + 'Tags: ' + tags.join(', ')
}

/** 把模型输出映射回原始标签对象顺序；没匹配上的原标签按原顺序补在最后，绝不丢标签。 */
function parsePyramidOutput(raw, tags) {
  const text = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() || ''
  const byKey = new Map()
  for (const tag of tags) {
    const key = normalizeKey(typeof tag === 'string' ? tag : tag.tag)
    if (!byKey.has(key)) byKey.set(key, tag)
  }
  const ordered = []
  const used = new Set()
  for (const piece of text.split(',')) {
    const cleaned = piece.trim().replace(/^\((.*):[\d.]+\)$/, '$1').replace(/^\[(.*):[\d.]+\]$/, '$1')
    const key = normalizeKey(cleaned)
    if (byKey.has(key) && !used.has(key)) { used.add(key); ordered.push(byKey.get(key)) }
  }
  for (const [key, tag] of byKey) if (!used.has(key)) ordered.push(tag)
  return { ordered, matched: used.size }
}

module.exports = {
  buildInventory,
  applyInventoryDecisions,
  auditInventory,
  loadSkills,
  loadSkill,
  buildSystemPrompt,
  buildTextPrompt,
  buildVisualPrompt,
  parseSkillDecisions,
  buildCorePrompt,
  buildPyramidPrompt,
  parsePyramidOutput,
  AuditResponseError,
}

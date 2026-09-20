/**
 * 通用标签一二级类目（头发 / 眼睛 / 服装 / 饰品 …）。
 * 数据：resources/tag-data/danbooru_general_categories.csv（tag,l1,l2，约 7.7 万条，
 * 来源 BooruDatasetTagManager+ 的 Danbooru 通用标签目录，MIT）。
 * 查不到的走后缀规则兜底；仍查不到归「一般」。
 */
const fs = require('fs')
const { tagDataPath } = require('./tag-data-path')

/** 展示顺序，同 BDTM+：身份类在前，外观类按头→脚，最后是场景 / 风格 / 一般 */
const PRIMARY_ORDER = ['角色', '作品', '画师', '人数', '头发', '眼睛', '身体', '表情', '服装', '饰品', 'cosplay', '物品', '动物', '食物', '动作', '构图', '背景', '画风', '一般']

const SUFFIX_RULES = [
  [/(^|[ _])(hair|bangs|ponytail|twintails|braid|ahoge|sidelocks|drill hair|hair bun)$/, '头发', '发型'],
  [/(^|[ _])eyes?$/, '眼睛', '眼睛'],
  [/(^|[ _])(pupils|eyelashes|eyebrows)$/, '眼睛', '瞳孔'],
  [/(^|[ _])(breasts|thighs|navel|skin|tail|horns|wings|ears|fang|fangs|teeth|tongue|nails|legs|feet|belly|armpits|collarbone|shoulders|hips)$/, '身体', '身体特征'],
  [/(^|[ _])(smile|blush|frown|grin|tears|open mouth|closed mouth|closed eyes|one eye closed|expressionless|angry|surprised|embarrassed|sweatdrop)$/, '表情', '表情'],
  [/(^|[ _])(shirt|skirt|dress|jacket|coat|pants|shorts|sweater|hoodie|uniform|kimono|bikini|swimsuit|apron|vest|blouse|cape|cloak|leotard|bodysuit|armor|gloves|socks|thighhighs|pantyhose|stockings|shoes|boots|sandals|heels|sneakers|footwear|legwear|panties|bra|underwear|lingerie|corset|garter|sleeves|collar|necktie|ribbon|bow|scarf|bowtie|belt|obi|sash)$/, '服装', '服装'],
  [/(^|[ _])(hat|cap|beret|hood|headband|hairband|hair ornament|hairclip|hairpin|hair ribbon|hair bow|hair flower|earrings|necklace|choker|bracelet|ring|glasses|sunglasses|eyepatch|mask|crown|tiara|veil|headphones|headdress|helmet|bag|backpack|watch|piercing|jewelry)$/, '饰品', '饰品'],
  [/(^|[ _])(sitting|standing|lying|kneeling|walking|running|jumping|holding|hand on|hands on|arm up|arms up|crossed arms|hand up|pointing|reaching|leaning|looking at|looking away|looking back|hugging|carrying|squatting|bent over|cowboy shot|dutch angle)$/, '动作', '姿势'],
  [/(^|[ _])(background|indoors|outdoors|sky|cloud|clouds|sunset|night|day|tree|trees|forest|city|street|room|bed|water|ocean|beach|snow|rain|flower field|grass)$/, '背景', '背景'],
  [/(^|[ _])(portrait|upper body|full body|close-up|from above|from below|from side|from behind|wide shot|solo focus|depth of field|blurry|blurry background|straight-on)$/, '构图', '构图'],
  [/(^|[ _])(monochrome|greyscale|sketch|lineart|traditional media|watercolor|pixel art|official art|game cg|comic|4koma|anime coloring|realistic|photorealistic|absurdres|highres|lowres|masterpiece|best quality|high quality|low quality|worst quality|jpeg artifacts|signature|watermark|artist name|dated|commentary)$/, '画风', '画风'],
]

let cache = null

function normalize(tag) {
  return String(tag || '').trim().toLowerCase().replace(/\s+/g, '_')
}

function parseLine(line) {
  const first = line.indexOf(',')
  if (first < 0) return null
  const second = line.indexOf(',', first + 1)
  if (second < 0) return null
  return [line.slice(0, first), line.slice(first + 1, second), line.slice(second + 1)]
}

function load() {
  if (cache) return cache
  const map = new Map()
  try {
    const text = fs.readFileSync(tagDataPath('danbooru_general_categories.csv'), 'utf8')
    const lines = text.split(/\r?\n/)
    for (let i = 1; i < lines.length; i++) {
      const parts = parseLine(lines[i])
      if (!parts || !parts[0]) continue
      map.set(parts[0].toLowerCase(), { l1: parts[1] || '一般', l2: parts[2] || '' })
    }
  } catch (_) { /* 数据文件缺失时只靠规则兜底 */ }
  cache = map
  return map
}

function classifyByRule(tag) {
  const spaced = normalize(tag).replace(/_/g, ' ')
  if (/^(\d+\+?(girls?|boys?|others?)|solo|multiple (girls|boys|others)|no humans|everyone|\d+koma)$/.test(spaced)) return { l1: '人数', l2: '人数' }
  if (/\(cosplay\)$/.test(spaced)) return { l1: 'cosplay', l2: '' }
  for (const [re, l1, l2] of SUFFIX_RULES) if (re.test(spaced)) return { l1, l2 }
  return null
}

/**
 * @param {string} tag
 * @param {{ wd14Category?: string }} [hint]  WD14 给出的粗分类（角色 / 通用 / 评级）
 * @returns {{ l1: string, l2: string, source: 'catalog'|'rule'|'hint'|'none' }}
 */
function classifyTag(tag, hint = {}) {
  const key = normalize(tag)
  if (!key) return { l1: '一般', l2: '', source: 'none' }
  const hit = load().get(key)
  if (hit) return { ...hit, source: 'catalog' }
  const rule = classifyByRule(tag)
  if (rule) return { ...rule, source: 'rule' }
  if (hint.wd14Category === '角色' || hint.wd14Category === 'character') return { l1: '角色', l2: '', source: 'hint' }
  if (hint.wd14Category === '评级' || hint.wd14Category === 'rating') return { l1: '画风', l2: '评级', source: 'hint' }
  return { l1: '一般', l2: '', source: 'none' }
}

function classifyTags(tags, hints = {}) {
  const out = {}
  for (const tag of tags || []) {
    const text = typeof tag === 'string' ? tag : tag?.tag
    if (!text) continue
    out[text] = classifyTag(text, { wd14Category: hints[text] })
  }
  return out
}

function primaryRank(l1) {
  const index = PRIMARY_ORDER.indexOf(l1)
  return index >= 0 ? index : PRIMARY_ORDER.length
}

/** 按一级类目排序（稳定；同类目内保持原顺序），前 keepFirst 个不动 */
function sortByCategory(tags, keepFirst = 0) {
  const head = tags.slice(0, keepFirst)
  const rest = tags.slice(keepFirst).map((tag, index) => ({ tag, index, rank: primaryRank(classifyTag(typeof tag === 'string' ? tag : tag.tag).l1) }))
  rest.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return [...head, ...rest.map((entry) => entry.tag)]
}

function _resetForTests() { cache = null }

module.exports = { classifyTag, classifyTags, sortByCategory, primaryRank, PRIMARY_ORDER, _resetForTests }

/**
 * 错误标签修复（参照 BDTM+ 的 fix-tags）：
 *  1. 人数标签冲突：同性别 1girl / 2girls 并存 → 删低留高；多人图里的 solo 一并清除（solo focus 永不动）
 *  2. 角色父子 / 变体重复：同一角色家族多个标签同图出现 → 按数据集出现量投票保留胜者
 *  3. 子级并入父级（可选阈值）：子级变体全库出现次数低于阈值 → 并入父级
 * 只产出计划（每张图删什么、加什么、为什么），应用交给调用方，便于预览和撤销。
 */

const COUNT_RE = /^(\d+)\+?[ _]?(girls?|boys?|others?)$/
const MULTI_RE = /^(multiple[ _](girls|boys|others)|\d+\+?[ _]?(girls|boys|others)|2\+?(girls|boys|others))$/

function norm(tag) {
  return String(tag || '').trim().toLowerCase().replace(/\s+/g, '_')
}

function genderOf(word) {
  if (word.startsWith('girl')) return 'girl'
  if (word.startsWith('boy')) return 'boy'
  return 'other'
}

function isMultiPerson(tag) {
  const key = norm(tag)
  const m = key.match(COUNT_RE)
  if (m) return Number(m[1]) >= 2
  return MULTI_RE.test(key)
}

/** 人数冲突：返回要删除的标签及原因 */
function planSubjectCount(tags) {
  const removals = []
  const byGender = new Map()
  for (const tag of tags) {
    const m = norm(tag).match(COUNT_RE)
    if (!m) continue
    const gender = genderOf(m[2])
    const list = byGender.get(gender) || []
    list.push({ tag, count: Number(m[1]) })
    byGender.set(gender, list)
  }
  for (const [gender, list] of byGender) {
    if (list.length < 2) continue
    const max = Math.max(...list.map((item) => item.count))
    for (const item of list) {
      if (item.count < max) removals.push({ tag: item.tag, reason: `与更高人数标签冲突（${gender}：保留 ${max}）` })
    }
  }
  const multi = tags.some((tag) => isMultiPerson(tag))
  if (multi) {
    for (const tag of tags) {
      if (norm(tag) === 'solo') removals.push({ tag, reason: '多人图不该有 solo' })
    }
  }
  return removals
}

/** 角色家族：child → root（沿父链走到头） */
function rootOf(tag, parentByChild, depth = 0) {
  const key = norm(tag)
  const parent = parentByChild.get(key)
  if (!parent || depth > 8) return key
  return rootOf(parent, parentByChild, depth + 1)
}

/**
 * @param {{ path: string, tags: string[] }[]} items
 * @param {{ parentByChild?: Map<string,string>, fixCharacterVariants?: boolean, childThreshold?: number }} options
 * @returns {{ path: string, remove: {tag:string, reason:string}[], add: {tag:string, reason:string}[] }[]}
 */
function planTagFixes(items, options = {}) {
  const rawMap = options.parentByChild instanceof Map ? options.parentByChild : new Map(Object.entries(options.parentByChild || {}))
  // 键值都规范化一次；父级集合建 Set，避免每个标签扫一遍 33 万条
  const parentByChild = new Map()
  for (const [child, parent] of rawMap) if (child && parent) parentByChild.set(norm(child), norm(parent))
  const parentSet = new Set(parentByChild.values())
  const fixVariants = options.fixCharacterVariants !== false && parentByChild.size > 0
  const childThreshold = fixVariants ? Math.max(0, Number(options.childThreshold) || 0) : 0

  // 全库出现次数（投票和阈值都用它）
  const datasetCount = new Map()
  for (const item of items) {
    const seen = new Set()
    for (const tag of item.tags || []) {
      const key = norm(tag)
      if (seen.has(key)) continue
      seen.add(key)
      datasetCount.set(key, (datasetCount.get(key) || 0) + 1)
    }
  }

  const plans = []
  for (const item of items) {
    const tags = item.tags || []
    const remove = planSubjectCount(tags)
    const add = []
    const removedKeys = new Set(remove.map((entry) => norm(entry.tag)))

    if (fixVariants) {
      // 同家族分组
      const families = new Map()
      for (const tag of tags) {
        const key = norm(tag)
        if (removedKeys.has(key)) continue
        const isCharacter = parentByChild.has(key) || parentSet.has(key)
        if (!isCharacter) continue
        const root = rootOf(key, parentByChild)
        const list = families.get(root) || []
        list.push(key)
        families.set(root, list)
      }
      for (const [, members] of families) {
        const unique = [...new Set(members)]
        if (unique.length >= 2) {
          // 投票：数据集里出现最多的赢；平手取父级（更靠近根的）
          const winner = unique.slice().sort((a, b) => (datasetCount.get(b) || 0) - (datasetCount.get(a) || 0) || (parentByChild.has(a) ? 1 : 0) - (parentByChild.has(b) ? 1 : 0))[0]
          for (const key of unique) {
            if (key === winner) continue
            const original = tags.find((tag) => norm(tag) === key) || key
            remove.push({ tag: original, reason: `同一角色的重复变体，保留出现更多的「${winner.replace(/_/g, ' ')}」` })
            removedKeys.add(key)
          }
        }
      }
      // 子级并入父级：低于阈值就不信它
      if (childThreshold > 0) {
        for (const tag of tags) {
          const key = norm(tag)
          if (removedKeys.has(key)) continue
          const parent = parentByChild.get(key)
          if (!parent) continue
          if ((datasetCount.get(key) || 0) >= childThreshold) continue
          remove.push({ tag, reason: `子级变体全库仅 ${datasetCount.get(key) || 0} 次（< ${childThreshold}），并入父级` })
          removedKeys.add(key)
          const parentPresent = tags.some((candidate) => norm(candidate) === parent)
          if (!parentPresent && !add.some((entry) => norm(entry.tag) === parent)) add.push({ tag: parent.replace(/_/g, ' '), reason: '由子级变体并入' })
        }
      }
    }

    if (remove.length || add.length) plans.push({ path: item.path, remove, add })
  }
  return plans
}

/** 把计划套到标签数组上（保持原顺序，新增放末尾） */
function applyPlan(tags, plan) {
  if (!plan) return [...tags]
  const removeKeys = new Set(plan.remove.map((entry) => norm(entry.tag)))
  const out = tags.filter((tag) => !removeKeys.has(norm(tag)))
  for (const entry of plan.add) if (!out.some((tag) => norm(tag) === norm(entry.tag))) out.push(entry.tag)
  return out
}

module.exports = { planTagFixes, planSubjectCount, applyPlan, isMultiPerson }

/**
 * 队列级标签操作（纯函数）：参照 BooruDatasetTagManager+ 的"全部标签"面板 ——
 * 统计整批出现次数、跨图重命名 / 删除 / 添加、触发词置顶。
 */
export interface QueueTag {
  tag: string
  confidence?: number
  source?: string
  category?: string
  weight?: number
}

export interface QueueTagCount {
  tag: string
  count: number
  /** 队列里有这个标签的图片索引 */
  indexes: number[]
}

export function normalizeTagName(tag: string): string {
  return tag.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
}

export function sameTag(a: string, b: string): boolean {
  return normalizeTagName(a) === normalizeTagName(b)
}

export function hasTag(tags: readonly QueueTag[], name: string): boolean {
  return tags.some((tag) => sameTag(tag.tag, name))
}

/** 整个队列的标签清单，按出现次数降序、同次数按名称 */
export function buildQueueInventory(queue: readonly { tags: readonly QueueTag[] }[]): QueueTagCount[] {
  const map = new Map<string, QueueTagCount>()
  queue.forEach((item, index) => {
    const seen = new Set<string>()
    for (const tag of item.tags) {
      const key = normalizeTagName(tag.tag)
      if (!key || seen.has(key)) continue
      seen.add(key)
      const entry = map.get(key) ?? { tag: tag.tag, count: 0, indexes: [] }
      entry.count++
      entry.indexes.push(index)
      map.set(key, entry)
    }
  })
  return [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** 重命名：已有目标标签时合并（去掉来源，保留目标位置） */
export function renameTag(tags: readonly QueueTag[], from: string, to: string): QueueTag[] {
  const target = to.trim()
  if (!target || sameTag(from, target)) return [...tags]
  const alreadyHasTarget = hasTag(tags, target)
  const out: QueueTag[] = []
  for (const tag of tags) {
    if (sameTag(tag.tag, from)) {
      if (!alreadyHasTarget) out.push({ ...tag, tag: target, source: tag.source ?? 'manual' })
      continue
    }
    out.push(tag)
  }
  return out
}

export function removeTag(tags: readonly QueueTag[], name: string): QueueTag[] {
  return tags.filter((tag) => !sameTag(tag.tag, name))
}

export function addTag(tags: readonly QueueTag[], name: string, position: 'first' | 'last' = 'last'): QueueTag[] {
  const value = name.trim()
  if (!value || hasTag(tags, value)) return [...tags]
  const entry: QueueTag = { tag: value, confidence: 1, source: 'manual', category: '手动添加' }
  return position === 'first' ? [entry, ...tags] : [...tags, entry]
}

/** 触发词永远在第一位：没有就插入，有但不在最前就挪到最前 */
export function ensureTriggerFirst(tags: readonly QueueTag[], trigger: string): QueueTag[] {
  const value = trigger.trim()
  if (!value) return [...tags]
  const existing = tags.find((tag) => sameTag(tag.tag, value))
  const rest = tags.filter((tag) => !sameTag(tag.tag, value))
  return [existing ?? { tag: value, confidence: 1, source: 'manual', category: '触发词' }, ...rest]
}

/**
 * 快速替换（BDTM+ 同款）：以规范词的最后一个词为"同类"判据（black shoes → shoes），
 * 把出现次数低于阈值的同类低频标签并入规范词。
 */
export function buildQuickReplacePlan(inventory: readonly QueueTagCount[], canonical: string, threshold: number): QueueTagCount[] {
  const canon = normalizeTagName(canonical)
  if (!canon) return []
  const family = canon.split(' ').filter(Boolean).pop()
  if (!family) return []
  return inventory
    .filter((row) => row.count < threshold)
    .filter((row) => {
      const key = normalizeTagName(row.tag)
      return key !== canon && (key === family || key.endsWith(' ' + family))
    })
    .sort((a, b) => a.count - b.count || a.tag.localeCompare(b.tag))
}

/** 是否需要改动（避免无意义的“已改”状态） */
export function tagsEqual(a: readonly QueueTag[], b: readonly QueueTag[]): boolean {
  if (a.length !== b.length) return false
  return a.every((tag, index) => tag.tag === b[index].tag && (tag.weight ?? 1) === (b[index].weight ?? 1))
}

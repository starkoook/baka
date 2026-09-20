/**
 * 渲染端的 caption 序列化，和主进程 electron/ipc/tag-weight.js 的 SD 格式保持一致：
 * 权重 1 直接写标签名；>1 写成 (tag:1.2)；<1 写成 [tag:0.8]。
 * 用于"实时 caption 预览"和复制，最终落盘仍由主进程负责。
 */
export interface CaptionTag {
  tag: string
  weight?: number
}

const EPSILON = 0.001

export function normalizeWeight(weight: number | undefined): number {
  const w = Number(weight)
  if (!Number.isFinite(w) || Math.abs(w - 1) < EPSILON) return 1
  return Math.round(w * 100) / 100
}

function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

export function serializeTag(tag: string, weight?: number): string {
  const name = String(tag ?? '').trim()
  const w = normalizeWeight(weight)
  if (!name || w === 1) return name
  const value = formatWeight(w)
  return w > 1 ? `(${name}:${value})` : `[${name}:${value}]`
}

export function serializeWeightedCaption(tags: readonly (CaptionTag | string)[]): string {
  return (tags ?? [])
    .map((tag) => (typeof tag === 'string' ? tag.trim() : serializeTag(tag.tag, tag.weight)))
    .filter(Boolean)
    .join(', ')
}

export interface TagDiff {
  added: string[]
  removed: string[]
  unchanged: number
}

/** 对比"保存前"与"现在"的标签集合，给按住对比用 */
export function diffTags(before: readonly CaptionTag[], after: readonly CaptionTag[]): TagDiff {
  const beforeSet = new Set(before.map((tag) => tag.tag))
  const afterSet = new Set(after.map((tag) => tag.tag))
  const added = [...afterSet].filter((tag) => !beforeSet.has(tag))
  const removed = [...beforeSet].filter((tag) => !afterSet.has(tag))
  return { added, removed, unchanged: [...afterSet].filter((tag) => beforeSet.has(tag)).length }
}

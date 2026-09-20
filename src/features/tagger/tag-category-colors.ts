/**
 * 一二级类目的展示顺序与配色（与主进程 tag-categories.js 的 PRIMARY_ORDER 保持一致）。
 * 颜色只给色相，明度 / 饱和度由 CSS 变量按主题决定，浅色深色都能看清。
 */
export const CATEGORY_ORDER = ['角色', '作品', '画师', '人数', '头发', '眼睛', '身体', '表情', '服装', '饰品', 'cosplay', '物品', '动物', '食物', '动作', '构图', '背景', '画风', '一般'] as const

export type TagPrimaryCategory = (typeof CATEGORY_ORDER)[number] | string

const HUES: Record<string, number> = {
  角色: 330, 作品: 300, 画师: 280, 人数: 350,
  头发: 30, 眼睛: 200, 身体: 15, 表情: 45,
  服装: 260, 饰品: 175, cosplay: 315,
  物品: 95, 动物: 130, 食物: 60, 动作: 220, 构图: 240, 背景: 150, 画风: 0, 一般: 0,
}

export function categoryRank(l1: string): number {
  const index = (CATEGORY_ORDER as readonly string[]).indexOf(l1)
  return index >= 0 ? index : CATEGORY_ORDER.length
}

/** 返回色相；「一般」和未知返回 null（用中性灰） */
export function categoryHue(l1: string): number | null {
  if (!l1 || l1 === '一般') return null
  return HUES[l1] ?? null
}

export function categoryStyle(l1: string): Record<string, string> {
  const hue = categoryHue(l1)
  if (hue === null) return {}
  return { '--cat-h': String(hue) }
}

/** 按一级类目稳定排序，前 keepFirst 个不动 */
export function sortTagsByCategory<T>(tags: readonly T[], l1Of: (tag: T) => string, keepFirst = 0): T[] {
  const head = tags.slice(0, keepFirst)
  const rest = tags.slice(keepFirst).map((tag, index) => ({ tag, index, rank: categoryRank(l1Of(tag)) }))
  rest.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return [...head, ...rest.map((entry) => entry.tag)]
}

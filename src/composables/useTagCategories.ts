import { reactive, readonly } from 'vue'

/**
 * 标签 → 一二级类目 的渲染进程缓存。主进程查 7.7 万条目录，这里只查一次，
 * 之后同名标签直接命中缓存；没有 API（浏览器预览）时全部落到「一般」。
 */
const cache = reactive<Record<string, TagCategoryInfo>>({})
const pending = new Set<string>()

export function useTagCategories() {
  async function ensure(tags: readonly string[], hints: Record<string, string> = {}) {
    const missing = [...new Set(tags.filter((tag) => tag && !cache[tag] && !pending.has(tag)))]
    if (!missing.length) return
    // 没有 API（浏览器预览 / preload 未就绪）时不写缓存：l1Of 默认就是「一般」，API 出现后还能补查
    if (!window.characterAuditAPI?.classify) return
    for (const tag of missing) pending.add(tag)
    try {
      const res = await window.characterAuditAPI.classify({ tags: missing, hints })
      if (res.success && res.data) {
        for (const tag of missing) cache[tag] = res.data[tag] ?? { l1: '一般', l2: '', source: 'none' }
      }
    } finally {
      for (const tag of missing) pending.delete(tag)
    }
  }

  function l1Of(tag: string): string {
    return cache[tag]?.l1 ?? '一般'
  }

  function l2Of(tag: string): string {
    return cache[tag]?.l2 ?? ''
  }

  return { categories: readonly(cache), ensure, l1Of, l2Of }
}

import { computed, ref, watch } from 'vue'
import { TOOL_CATALOG, findTool, type ToolKey } from '@/features/tools/tool-catalog'
import { useAppStore } from '@/stores/app'

const customPosterCache = new Map<string, string>()

/**
 * 工具海报：用户在设置里选了本地图片就用那张（读一次缓存起来），否则用默认海报。
 * 侧栏头像、工具选择页、首页"最近工作区"共用。
 */
export function useToolPosters() {
  const appStore = useAppStore()
  const customSources = ref<Partial<Record<ToolKey, string>>>({})

  async function readCustomPoster(path: string): Promise<string | null> {
    const cached = customPosterCache.get(path)
    if (cached) return cached
    if (!window.fsAPI?.readImageBase64) return null
    try {
      const result = await window.fsAPI.readImageBase64(path)
      if (!result.success || !result.base64) return null
      const src = `data:${result.mime || 'image/png'};base64,${result.base64}`
      customPosterCache.set(path, src)
      return src
    } catch {
      return null
    }
  }

  async function refresh() {
    const next: Partial<Record<ToolKey, string>> = {}
    await Promise.all(TOOL_CATALOG.map(async (tool) => {
      const path = appStore.toolPosters[tool.key]
      if (!path) return
      const src = await readCustomPoster(path)
      if (src) next[tool.key] = src
    }))
    customSources.value = next
  }

  watch(() => appStore.toolPosters, () => { void refresh() }, { immediate: true, deep: true })

  const posterOf = computed(() => (key: ToolKey) => customSources.value[key] ?? findTool(key).poster)
  const isCustom = computed(() => (key: ToolKey) => Boolean(customSources.value[key]))

  return { posterOf, isCustom, refresh }
}

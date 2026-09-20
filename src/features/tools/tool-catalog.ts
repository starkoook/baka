/**
 * 工具目录：工具选择页、侧栏"当前工具"头像、设置里的海报自定义都从这里取数据，
 * 不再各处维护一份工具列表。
 */
export type ToolKey =
  | 'gallery'
  | 'booruGallery'
  | 'tagger'
  | 'training'
  | 'upscale'
  | 'video'
  | 'imageTools'
  | 'console'

export interface ToolEntry {
  readonly key: ToolKey
  readonly label: string
  readonly desc: string
  readonly route: string
  /** 路由前缀；命中任意一个即视为"当前工具" */
  readonly matches: readonly string[]
  /** 默认海报（public 下的路径）；用户可在设置里覆盖 */
  readonly poster: string
  /** 海报裁切焦点，让共用同一张图的工具看起来不一样 */
  readonly posterPosition: string
}

export const TOOL_CATALOG: readonly ToolEntry[] = [
  { key: 'gallery', label: '图库', desc: '整理与筛选素材，导入、回收站都在这里', route: '/gallery', matches: ['/gallery'], poster: '/tools/gallery.jpg', posterPosition: 'center 30%' },
  { key: 'booruGallery', label: '在线画廊', desc: '在多个图站里搜索、收藏、下载素材', route: '/booru-gallery', matches: ['/booru-gallery'], poster: '/branding/dashboard-hero-1920.webp', posterPosition: 'center 24%' },
  { key: 'tagger', label: '标注', desc: '自动打标、批量编辑、逐张校对', route: '/tagger', matches: ['/tagger'], poster: '/tools/tagger.jpg', posterPosition: 'center 22%' },
  { key: 'training', label: '训练', desc: 'LoRA 训练配置、运行与日志', route: '/training', matches: ['/training'], poster: '/tools/train.jpg', posterPosition: 'center 45%' },
  { key: 'upscale', label: '放大', desc: '本地超分辨率放大', route: '/upscale', matches: ['/upscale'], poster: '/tools/upscale.jpg', posterPosition: 'center 20%' },
  { key: 'video', label: '视频工具', desc: '抽帧、转换与视频打标', route: '/video', matches: ['/video'], poster: '/tools/train.jpg', posterPosition: '20% 60%' },
  { key: 'imageTools', label: '图像工具', desc: '背景处理、编辑与图库体检', route: '/image-tools', matches: ['/image-tools'], poster: '/tools/upscale.jpg', posterPosition: '35% 65%' },
  { key: 'console', label: '控制台', desc: '运行日志、错误与诊断', route: '/console', matches: ['/console'], poster: '/tools/workbench.jpg', posterPosition: 'center 30%' },
]

export function findTool(key: ToolKey): ToolEntry {
  const entry = TOOL_CATALOG.find((tool) => tool.key === key)
  if (!entry) throw new Error(`Unknown tool: ${key}`)
  return entry
}

export function findToolByRoute(routePath: string | null | undefined): ToolEntry | null {
  if (!routePath) return null
  return TOOL_CATALOG.find((tool) => tool.matches.some((prefix) => routePath === prefix || routePath.startsWith(prefix + '/'))) ?? null
}

/** 按名称 / 说明 / 路由做子串过滤；空关键字返回全部 */
export function filterTools(query: string, tools: readonly ToolEntry[] = TOOL_CATALOG): ToolEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...tools]
  return tools.filter((tool) =>
    tool.label.toLowerCase().includes(q)
    || tool.desc.toLowerCase().includes(q)
    || tool.key.toLowerCase().includes(q)
    || tool.route.toLowerCase().includes(q),
  )
}

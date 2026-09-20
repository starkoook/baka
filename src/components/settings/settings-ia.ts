export type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'models'
  | 'api'
  | 'network'
  | 'local'
  | 'components'
  | 'about'

export type SettingsIconName =
  | 'sliders'
  | 'palette'
  | 'box'
  | 'key'
  | 'wifi'
  | 'drive'
  | 'puzzle'
  | 'info'

export interface SettingsSection {
  id: SettingsSectionId
  label: string
  hint: string
  icon: SettingsIconName
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general', label: '\u901a\u7528', hint: '\u6807\u6ce8\u4fdd\u5b58\u4e0e\u64cd\u4f5c\u53cd\u9988', icon: 'sliders' },
  { id: 'appearance', label: '\u5916\u89c2', hint: '\u4e3b\u9898\u3001\u52a9\u624b\u4e0e\u9884\u89c8\u56fe', icon: 'palette' },
  { id: 'models', label: '\u6a21\u578b', hint: '\u4e0b\u8f7d\u4e0e\u7ba1\u7406\u5df2\u5b89\u88c5\u6a21\u578b', icon: 'box' },
  { id: 'api', label: '\u63a5\u53e3', hint: 'LLM \u4e0e\u6253\u6807 API', icon: 'key' },
  { id: 'network', label: '\u7f51\u7edc', hint: '\u56fe\u7ad9\u4ee3\u7406\u4e0e\u8d85\u65f6', icon: 'wifi' },
  { id: 'local', label: '\u672c\u5730', hint: '\u7f13\u5b58\u3001\u56de\u6536\u7ad9\u4e0e\u8def\u5f84', icon: 'drive' },
  { id: 'components', label: '\u7ec4\u4ef6', hint: '\u8bad\u7ec3\u8fd0\u884c\u73af\u5883', icon: 'puzzle' },
  { id: 'about', label: '\u5173\u4e8e', hint: '\u7248\u672c\u4e0e\u6570\u636e\u76ee\u5f55', icon: 'info' },
]

export function inferDataRoot(modelDir: string): string {
  const trimmed = modelDir.trim()
  if (!trimmed) return ''
  return trimmed.replace(/[\\\/]+tagger-models[\\\/]?$/i, '')
}

export function normalizeCacheSize(raw: unknown): { items: { name: string; size: string }[]; total: string } {
  if (!raw || typeof raw !== 'object') return { items: [], total: '0 B' }
  const record = raw as Record<string, unknown>
  if (Array.isArray(record.items)) {
    return {
      items: record.items as { name: string; size: string }[],
      total: typeof record.total === 'string' ? record.total : '0 B',
    }
  }
  const items = Object.entries(record).map(([name, value]) => {
    const kb = value && typeof value === 'object' && 'size' in value
      ? Number((value as { size: number }).size) || 0
      : 0
    return { name, size: formatKb(kb), kb }
  })
  const appCache = items.find((item) => item.name.includes('\u5e94\u7528') || item.name.toLowerCase().includes('user'))
  const totalKb = appCache ? appCache.kb : items.reduce((sum, item) => sum + item.kb, 0)
  return { items: items.map(({ name, size }) => ({ name, size })), total: formatKb(totalKb) }
}

function formatKb(kb: number): string {
  if (!Number.isFinite(kb) || kb <= 0) return '0 B'
  if (kb < 1024) return String(Math.round(kb)) + ' KB'
  return (kb / 1024).toFixed(1) + ' MB'
}

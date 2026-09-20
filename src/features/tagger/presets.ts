/**
 * 标注预设：把一组标注参数（引擎、模型、阈值、选项）存成一个名字，随时一键套用。
 * 只存在本机 localStorage，和参考项目的"我的预设 / 存为预设"一样是会话外持久、设备内私有。
 */
export type TaggerBackend = 'local' | 'llm' | 'combined'

export interface TaggerPreset {
  id: string
  name: string
  createdAt: string
  tagSource: TaggerBackend
  modelPath: string
  threshold: number
  characterThreshold: number
  addCharacter: boolean
  addCopyright: boolean
  replaceUnderscores: boolean
}

export type TaggerPresetInput = Omit<TaggerPreset, 'id' | 'name' | 'createdAt'>

export const TAGGER_PRESETS_KEY = 'baka-tagger-presets-v1'
export const MAX_TAGGER_PRESETS = 20

export interface PresetStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback
}

function normalize(raw: unknown): TaggerPreset | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) return null
  const tagSource = item.tagSource === 'llm' || item.tagSource === 'combined' ? item.tagSource : 'local'
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.slice(0, 50),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    tagSource,
    modelPath: typeof item.modelPath === 'string' ? item.modelPath : '',
    threshold: clamp01(item.threshold, 0.35),
    characterThreshold: clamp01(item.characterThreshold, 0.85),
    addCharacter: item.addCharacter !== false,
    addCopyright: item.addCopyright !== false,
    replaceUnderscores: item.replaceUnderscores === true,
  }
}

export function loadTaggerPresets(storage: PresetStorage): TaggerPreset[] {
  try {
    const raw = storage.getItem(TAGGER_PRESETS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalize).filter((preset): preset is TaggerPreset => preset !== null).slice(0, MAX_TAGGER_PRESETS)
  } catch {
    return []
  }
}

function persist(storage: PresetStorage, presets: TaggerPreset[]) {
  try {
    storage.setItem(TAGGER_PRESETS_KEY, JSON.stringify(presets))
  } catch {
    // 预设是锦上添花，存不下不能影响标注
  }
}

/** 同名预设会被覆盖（保留原 id 与位置），否则插到最前面。 */
export function saveTaggerPreset(storage: PresetStorage, name: string, input: TaggerPresetInput): TaggerPreset[] {
  const trimmed = name.trim().slice(0, 50)
  if (!trimmed) return loadTaggerPresets(storage)
  const presets = loadTaggerPresets(storage)
  const existingIndex = presets.findIndex((preset) => preset.name === trimmed)
  const next: TaggerPreset = {
    id: existingIndex >= 0 ? presets[existingIndex].id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    createdAt: new Date().toISOString(),
    ...input,
    threshold: clamp01(input.threshold, 0.35),
    characterThreshold: clamp01(input.characterThreshold, 0.85),
  }
  if (existingIndex >= 0) presets[existingIndex] = next
  else presets.unshift(next)
  const trimmedList = presets.slice(0, MAX_TAGGER_PRESETS)
  persist(storage, trimmedList)
  return trimmedList
}

export function deleteTaggerPreset(storage: PresetStorage, id: string): TaggerPreset[] {
  const presets = loadTaggerPresets(storage).filter((preset) => preset.id !== id)
  persist(storage, presets)
  return presets
}

/** 当前参数是否和某个预设完全一致（用于高亮"正在用的预设"） */
export function matchesPreset(preset: TaggerPreset, input: TaggerPresetInput): boolean {
  return preset.tagSource === input.tagSource
    && preset.modelPath === input.modelPath
    && Math.abs(preset.threshold - input.threshold) < 0.005
    && Math.abs(preset.characterThreshold - input.characterThreshold) < 0.005
    && preset.addCharacter === input.addCharacter
    && preset.addCopyright === input.addCopyright
    && preset.replaceUnderscores === input.replaceUnderscores
}

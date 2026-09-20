import {
  defaultAnnotationPromptSettings,
  generateAnnotationPrompt,
  type AnnotationPromptMode,
  type AnnotationPromptSettings,
} from '@/lib/annotationPrompt'

export type LlmPromptMode = AnnotationPromptMode
export type LlmOutputFormat = 'danbooru' | 'natural' | 'both'

export interface LlmPromptState extends AnnotationPromptSettings {
  outputFormat: LlmOutputFormat
  templateId: string
}

export const LLM_PROMPT_STORAGE_KEY = 'baka-llm-prompt-v1'

const MODE_PRESETS: Record<AnnotationPromptMode, { outputFormat: LlmOutputFormat; templateId: string }> = {
  exact: { outputFormat: 'natural', templateId: 'natural' },
  short: { outputFormat: 'natural', templateId: 'natural' },
  tag: { outputFormat: 'danbooru', templateId: 'danbooru-tags' },
  empty: { outputFormat: 'danbooru', templateId: '' },
}

const BOOL_KEYS = [
  'atmosphere',
  'quality',
  'lensInfo',
  'ignoreText',
  'facialFeatures',
  'jpegCompression',
  'adversarialNoise',
  'aiGenerated',
] as const

type LegacyPromptFields = {
  mode?: string
  customPrompt?: string
}

export function defaultLlmPromptState(): LlmPromptState {
  return {
    ...defaultAnnotationPromptSettings,
    ...MODE_PRESETS[defaultAnnotationPromptSettings.annotationMode],
  }
}

function extraPrompt(current?: Partial<LlmPromptState> & LegacyPromptFields): string | undefined {
  if (typeof current?.additionalPromptContent === 'string') return current.additionalPromptContent
  if (typeof current?.customPrompt === 'string') return current.customPrompt
  return undefined
}

function pickBools(current?: Partial<LlmPromptState>): Pick<AnnotationPromptSettings, (typeof BOOL_KEYS)[number]> {
  const fallback = defaultAnnotationPromptSettings
  const out = {} as Pick<AnnotationPromptSettings, (typeof BOOL_KEYS)[number]>
  for (const key of BOOL_KEYS) {
    out[key] = typeof current?.[key] === 'boolean' ? current[key]! : fallback[key]
  }
  return out
}

export function applyPromptMode(mode: LlmPromptMode, current?: Partial<LlmPromptState> & LegacyPromptFields): LlmPromptState {
  return {
    ...pickBools(current),
    annotationMode: mode,
    additionalPromptContent: extraPrompt(current) ?? '',
    ...MODE_PRESETS[mode],
  }
}

function inferMode(parsed: Partial<LlmPromptState> & LegacyPromptFields): AnnotationPromptMode {
  const allowed: AnnotationPromptMode[] = ['exact', 'short', 'tag', 'empty']
  if (allowed.includes(parsed.annotationMode as AnnotationPromptMode)) {
    return parsed.annotationMode as AnnotationPromptMode
  }
  if (allowed.includes(parsed.mode as AnnotationPromptMode)) {
    return parsed.mode as AnnotationPromptMode
  }
  if (parsed.outputFormat === 'natural') return 'exact'
  const extra = extraPrompt(parsed)
  if (!parsed.templateId && extra) return 'empty'
  return 'tag'
}

export function loadLlmPromptState(): LlmPromptState {
  const fallback = defaultLlmPromptState()
  try {
    const raw = localStorage.getItem(LLM_PROMPT_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<LlmPromptState> & LegacyPromptFields
    const annotationMode = inferMode(parsed)
    const preset = MODE_PRESETS[annotationMode]
    const outputFormat = parsed.outputFormat === 'natural' || parsed.outputFormat === 'both' || parsed.outputFormat === 'danbooru'
      ? parsed.outputFormat
      : preset.outputFormat
    return {
      annotationMode,
      ...pickBools(parsed),
      additionalPromptContent: extraPrompt(parsed) ?? '',
      outputFormat,
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : preset.templateId,
    }
  } catch {
    return fallback
  }
}

export function saveLlmPromptState(state: LlmPromptState): void {
  try {
    localStorage.setItem(LLM_PROMPT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private mode
  }
}

export function compiledPrompt(state: LlmPromptState): string {
  return generateAnnotationPrompt({
    annotationMode: state.annotationMode,
    atmosphere: state.atmosphere,
    quality: state.quality,
    lensInfo: state.lensInfo,
    ignoreText: state.ignoreText,
    facialFeatures: state.facialFeatures,
    jpegCompression: state.jpegCompression,
    adversarialNoise: state.adversarialNoise,
    aiGenerated: state.aiGenerated,
    additionalPromptContent: state.additionalPromptContent,
  })
}

export function previewPromptText(state: LlmPromptState): string {
  return compiledPrompt(state)
}

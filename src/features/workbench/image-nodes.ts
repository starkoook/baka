export interface GenerationMetadata {
  hasMetadata?: boolean
  prompt?: string
  negative?: string
  model?: string
  generator?: string
  seed?: string | number
  steps?: number
  cfg?: number
  sampler?: string
  width?: number
  height?: number
  workflow?: unknown
  nodeTypes?: string[]
  sourceHints?: Array<{ nodeType: string; registryId?: string; repository?: string }>
}

export interface EditDefaults {
  editPrompt: string
  model: string
  outputSize: string
  touched: Partial<Record<'editPrompt' | 'model' | 'outputSize', boolean>>
}

export function applyMetadataDefaults(
  current: EditDefaults,
  metadata: GenerationMetadata,
  models: string[],
): EditDefaults {
  return {
    ...current,
    editPrompt: current.touched.editPrompt ? current.editPrompt : (current.editPrompt || metadata.prompt || ''),
    model: current.touched.model ? current.model : (current.model || (metadata.model && models.includes(metadata.model) ? metadata.model : '')),
    outputSize: current.touched.outputSize ? current.outputSize : (current.outputSize || (metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : '')),
  }
}

export function arrangeDroppedImages(origin: { x: number; y: number }, count: number, width: number) {
  return Array.from({ length: count }, (_, index) => ({ x: origin.x + index * (width + 24), y: origin.y }))
}

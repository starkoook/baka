export interface MetadataField {
  key: string
  label: string
  value: string | number
}

function hasValue(value: unknown): value is string | number {
  return value !== undefined && value !== null && value !== ''
}

function addField(fields: MetadataField[], key: string, label: string, value: unknown) {
  if (hasValue(value)) fields.push({ key, label, value })
}

function stringifyRawMetadata(rawMetadata: Record<string, string>) {
  const formatted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawMetadata)) {
    if (typeof value !== 'string') {
      formatted[key] = value
      continue
    }
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        formatted[key] = JSON.parse(value)
      } catch (_) {
        formatted[key] = value
      }
    } else {
      formatted[key] = value
    }
  }
  return JSON.stringify(formatted, null, 2)
}

export function buildMetadataSections(metadata: SDMetadata, tags: TagInfo[]) {
  const overview: MetadataField[] = []
  const generation: MetadataField[] = []
  const raw: MetadataField[] = []

  addField(overview, 'model', '模型', metadata.model)
  addField(overview, 'generator', '生成器', metadata.generator)
  if (hasValue(metadata.width) && hasValue(metadata.height)) {
    addField(overview, 'resolution', '尺寸', `${metadata.width} × ${metadata.height}`)
  }
  addField(overview, 'steps', 'Steps', metadata.steps)
  addField(overview, 'cfg', 'CFG', metadata.cfg)
  addField(overview, 'seed', 'Seed', metadata.seed)
  addField(overview, 'sampler', '采样器', metadata.sampler)
  addField(overview, 'vae', 'VAE', metadata.vae)
  addField(overview, 'clip', 'Clip Skip', metadata.clip)
  if (metadata.loras?.length) {
    const value = metadata.loras
      .map((lora) => {
        const parts = [`${lora.displayName || lora.name}`, `模型 ${lora.weight}`]
        if (hasValue(lora.textEncoderWeight)) parts.push(`文本编码器 ${lora.textEncoderWeight}`)
        return parts.join(' · ')
      })
      .join('\n')
    addField(overview, 'lora', 'LoRA', value)
  }

  addField(generation, 'prompt', '正向提示词', metadata.prompt)
  addField(generation, 'negative', '反向提示词', metadata.negative)
  if (metadata.rawMetadata && Object.keys(metadata.rawMetadata).length > 0) {
    addField(raw, 'rawMetadata', '原始元数据', stringifyRawMetadata(metadata.rawMetadata))
  }

  return { overview, generation, raw, tags: [...tags] }
}

export function formatAllMetadata(metadata: SDMetadata) {
  const sections = buildMetadataSections(metadata, [])
  return [...sections.overview, ...sections.generation, ...sections.raw]
    .map((field) => `${field.label}: ${field.value}`)
    .join('\n')
}

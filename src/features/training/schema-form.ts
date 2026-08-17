export interface TrainingSchemaMeta {
  default?: unknown
  description?: string
  disabled?: boolean
  hidden?: boolean
  max?: number
  min?: number
  required?: boolean
  role?: { name: string; options?: Record<string, unknown> }
  step?: number
}

export interface TrainingSchemaNode {
  type: 'array' | 'boolean' | 'const' | 'intersect' | 'number' | 'object' | 'select' | 'string' | 'union'
  meta: TrainingSchemaMeta
  fields?: Record<string, TrainingSchemaNode>
  item?: TrainingSchemaNode
  items?: TrainingSchemaNode[]
  options?: Array<string | number | boolean>
  value?: unknown
}

export interface TrainingFormField {
  key: string
  section: string
  schema: TrainingSchemaNode
}

function constConditions(node: TrainingSchemaNode): Array<[string, unknown]> {
  if (node.type === 'object') {
    return Object.entries(node.fields || {}).flatMap(([key, field]) =>
      field.type === 'const' ? [[key, field.value] as [string, unknown]] : [],
    )
  }
  if (node.type === 'intersect') return (node.items || []).flatMap(constConditions)
  return []
}

function branchMatches(node: TrainingSchemaNode, draft: Record<string, any>) {
  const conditions = constConditions(node)
  return conditions.length === 0 || conditions.every(([key, value]) => draft[key] === value)
}

function applyDefaults(node: TrainingSchemaNode, target: Record<string, any>) {
  if (node.type === 'object') {
    for (const [key, field] of Object.entries(node.fields || {})) {
      if (target[key] === undefined) {
        if (Object.prototype.hasOwnProperty.call(field.meta || {}, 'default')) target[key] = field.meta.default
        else if (field.type === 'const' && field.meta?.required) target[key] = field.value
      }
    }
    return
  }
  if (node.type === 'intersect') {
    for (const child of node.items || []) applyDefaults(child, target)
    return
  }
  if (node.type === 'union') {
    for (const child of node.items || []) {
      if (branchMatches(child, target)) applyDefaults(child, target)
    }
  }
}

export function materializeDefaults(schema: TrainingSchemaNode, initial: Record<string, any> = {}) {
  const draft = { ...initial }
  applyDefaults(schema, draft)
  // Conditional defaults can depend on values materialized in the first pass.
  applyDefaults(schema, draft)
  return draft
}

export function collectVisibleFields(schema: TrainingSchemaNode, draft: Record<string, any>) {
  const fields: TrainingFormField[] = []
  const seen = new Set<string>()

  function visit(node: TrainingSchemaNode, section = '其他设置') {
    if (!node || node.meta?.hidden) return
    if (node.type === 'intersect') {
      for (const child of node.items || []) visit(child, section)
      return
    }
    if (node.type === 'union') {
      for (const child of node.items || []) {
        if (branchMatches(child, draft)) visit(child, section)
      }
      return
    }
    if (node.type !== 'object') return

    const nextSection = node.meta?.description || section
    for (const [key, field] of Object.entries(node.fields || {})) {
      if (field.meta?.hidden || seen.has(key)) continue
      if (field.type === 'object' || field.type === 'intersect' || field.type === 'union') {
        visit(field, nextSection)
        continue
      }
      if (field.type === 'const' && field.meta?.required && draft[key] === field.value && seen.has(key)) continue
      seen.add(key)
      fields.push({ key, section: nextSection, schema: field })
    }
  }

  visit(schema)
  return fields
}

export function validateTrainingDraft(schema: TrainingSchemaNode, draft: Record<string, any>) {
  const issues: Array<{ key: string; message: string }> = []
  for (const field of collectVisibleFields(schema, draft)) {
    const value = draft[field.key]
    const label = field.schema.meta?.description || field.key
    if (field.schema.meta?.required && (value === undefined || value === null || String(value).trim() === '')) {
      issues.push({ key: field.key, message: `${label}不能为空` })
      continue
    }
    if (field.schema.type === 'number' && value !== '' && value !== undefined && value !== null) {
      const numberValue = Number(value)
      if (field.schema.meta?.min !== undefined && numberValue < field.schema.meta.min) {
        issues.push({ key: field.key, message: `${label}不能小于 ${field.schema.meta.min}` })
      } else if (field.schema.meta?.max !== undefined && numberValue > field.schema.meta.max) {
        issues.push({ key: field.key, message: `${label}不能大于 ${field.schema.meta.max}` })
      }
    }
  }
  return issues
}

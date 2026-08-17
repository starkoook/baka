const vm = require('vm')

class SchemaNode {
  constructor(type, details = {}, meta = {}) {
    this.type = type
    Object.assign(this, details)
    this.meta = meta
  }

  withMeta(key, value = true) {
    return new SchemaNode(this.type, this.details(), { ...this.meta, [key]: value })
  }

  details() {
    const details = {}
    for (const [key, value] of Object.entries(this)) {
      if (key !== 'type' && key !== 'meta') details[key] = value
    }
    return details
  }

  default(value) { return this.withMeta('default', value) }
  description(value) { return this.withMeta('description', value) }
  disabled(value = true) { return this.withMeta('disabled', value) }
  hidden(value = true) { return this.withMeta('hidden', value) }
  max(value) { return this.withMeta('max', value) }
  min(value) { return this.withMeta('min', value) }
  required(value = true) { return this.withMeta('required', value) }
  role(name, options = {}) { return this.withMeta('role', { name, options }) }
  step(value) { return this.withMeta('step', value) }
}

const Schema = Object.freeze({
  array: item => new SchemaNode('array', { item }),
  boolean: () => new SchemaNode('boolean'),
  const: value => new SchemaNode('const', { value }),
  intersect: items => new SchemaNode('intersect', { items }),
  number: () => new SchemaNode('number'),
  object: fields => new SchemaNode('object', { fields }),
  string: () => new SchemaNode('string'),
  union: items => {
    const literal = items.every(item => !(item instanceof SchemaNode))
    return literal
      ? new SchemaNode('select', { options: items })
      : new SchemaNode('union', { items })
  },
})

function updateSchema(source, additions, removed = []) {
  const result = { ...(source || {}), ...(additions || {}) }
  for (const key of removed || []) delete result[key]
  return result
}

function evaluate(source, sharedSchemas) {
  const sandbox = {
    Schema,
    SHARED_SCHEMAS: sharedSchemas,
    UpdateSchema: updateSchema,
  }
  return vm.runInNewContext(source, sandbox, {
    timeout: 1500,
    contextCodeGeneration: { strings: false, wasm: false },
  })
}

function countFields(node, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return 0
  seen.add(node)
  if (node.type === 'object') {
    return Object.entries(node.fields || {}).reduce((count, [, field]) => count + 1 + countFields(field, seen), 0)
  }
  const children = node.items || (node.item ? [node.item] : [])
  return children.reduce((count, child) => count + countFields(child, seen), 0)
}

function toSerializable(node) {
  return JSON.parse(JSON.stringify(node))
}

function compileTrainerSchemas(entries) {
  const unsupported = []
  const sharedEntry = entries.find(entry => entry.name === 'shared')
  let sharedSchemas = {}

  if (sharedEntry) {
    try {
      sharedSchemas = evaluate(sharedEntry.schema, {})
    } catch (error) {
      unsupported.push({ schema: 'shared', message: error.message })
    }
  }

  const schemas = []
  for (const entry of entries) {
    if (entry.name === 'shared') continue
    try {
      const compiled = evaluate(entry.schema, sharedSchemas)
      schemas.push({
        name: entry.name,
        hash: entry.hash,
        schema: toSerializable(compiled),
        fieldCount: countFields(compiled),
      })
    } catch (error) {
      unsupported.push({ schema: entry.name, message: error.message })
    }
  }

  return { schemas, unsupported }
}

module.exports = { compileTrainerSchemas }

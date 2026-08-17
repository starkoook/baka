import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { compileTrainerSchemas } = require('../../runtime/training-schema-runtime.js') as {
  compileTrainerSchemas: (schemas: Array<{ name: string; hash: string; schema: string }>) => {
    schemas: Array<{ name: string; hash: string; schema: unknown; fieldCount: number }>
    unsupported: Array<{ schema: string; message: string }>
  }
}

function loadSchemas() {
  const schemaRoot = resolve(process.cwd(), 'lora-rescripts-main/mikazuki/schema')
  return readdirSync(schemaRoot)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({
      name: name.replace(/\.ts$/, ''),
      hash: name,
      schema: readFileSync(resolve(schemaRoot, name), 'utf8'),
    }))
}

describe('training schema runtime', () => {
  it('compiles every trainer schema without silently dropping unsupported definitions', () => {
    const source = loadSchemas()
    const result = compileTrainerSchemas(source)

    expect(result.unsupported).toEqual([])
    expect(result.schemas.map((item) => item.name)).toEqual(
      source.filter((item) => item.name !== 'shared').map((item) => item.name),
    )
    expect(result.schemas.every((item) => item.fieldCount > 0)).toBe(true)
  })

  it('keeps field metadata required by the Baka form renderer', () => {
    const result = compileTrainerSchemas(loadSchemas())
    const basic = result.schemas.find((item) => item.name === 'lora-basic')
    const serialized = JSON.stringify(basic?.schema)

    expect(serialized).toContain('pretrained_model_name_or_path')
    expect(serialized).toContain('filepicker')
    expect(serialized).toContain('max_train_epochs')
    expect(serialized).toContain('description')
  })
})

import { describe, expect, it } from 'vitest'
import { collectVisibleFields, materializeDefaults, validateTrainingDraft } from '../schema-form'
import type { TrainingSchemaNode } from '../schema-form'

const schema: TrainingSchemaNode = {
  type: 'intersect',
  meta: {},
  items: [
    {
      type: 'object',
      meta: { description: '基础设置' },
      fields: {
        enabled: { type: 'boolean', meta: { default: false, description: '启用预览' } },
        epochs: { type: 'number', meta: { default: 10, min: 1, required: true, description: '轮数' } },
      },
    },
    {
      type: 'union',
      meta: {},
      items: [
        {
          type: 'object',
          meta: {},
          fields: {
            enabled: { type: 'const', value: true, meta: { required: true } },
            prompt: { type: 'string', meta: { required: true, description: '预览提示词' } },
          },
        },
        { type: 'object', meta: {}, fields: {} },
      ],
    },
  ],
}

describe('dynamic training schema form', () => {
  it('materializes defaults and only reveals matching conditional fields', () => {
    const draft = materializeDefaults(schema)

    expect(draft).toMatchObject({ enabled: false, epochs: 10 })
    expect(collectVisibleFields(schema, draft).map((field) => field.key)).toEqual(['enabled', 'epochs'])

    draft.enabled = true
    expect(collectVisibleFields(schema, draft).map((field) => field.key)).toEqual(['enabled', 'epochs', 'prompt'])
  })

  it('validates required values and numeric ranges from visible fields', () => {
    const draft = { enabled: true, epochs: 0, prompt: '' }

    expect(validateTrainingDraft(schema, draft)).toEqual([
      { key: 'epochs', message: '轮数不能小于 1' },
      { key: 'prompt', message: '预览提示词不能为空' },
    ])
  })
})

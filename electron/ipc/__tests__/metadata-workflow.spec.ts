import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { parseMetadata } from '../metadata.js'

function chunk(type: string, text: string) {
  const data = Buffer.concat([Buffer.from(type === 'tEXt' ? 'workflow\0' : ''), Buffer.from(text)])
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 4, 'ascii')
  return Buffer.concat([head, data, Buffer.alloc(4)])
}

function pngWithWorkflow(workflow: object) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('tEXt', JSON.stringify(workflow)),
  ])
}

function pngWithMetadata(workflow: object, prompt: object) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('tEXt', JSON.stringify(workflow)),
    Buffer.concat([
      (() => {
        const data = Buffer.concat([Buffer.from('prompt\0'), Buffer.from(JSON.stringify(prompt))])
        const head = Buffer.alloc(8)
        head.writeUInt32BE(data.length, 0)
        head.write('tEXt', 4, 4, 'ascii')
        return Buffer.concat([head, data, Buffer.alloc(4)])
      })(),
    ]),
  ])
}

function pngWithParameters(parameters: string) {
  const data = Buffer.concat([Buffer.from('parameters\0'), Buffer.from(parameters)])
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write('tEXt', 4, 4, 'ascii')
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    head, data, Buffer.alloc(4),
  ])
}

function pngTextChunk(keyword: string, text: string) {
  const data = Buffer.concat([Buffer.from(`${keyword}\0`), Buffer.from(text)])
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write('tEXt', 4, 4, 'ascii')
  return Buffer.concat([head, data, Buffer.alloc(4)])
}

describe('ComfyUI workflow metadata', () => {
  it('reads compressed iTXt workflow chunks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'compressed-itxt.png')
    const workflow = JSON.stringify({ nodes: [{ type: 'CompressedNode' }] })
    const data = Buffer.concat([
      Buffer.from('workflow\0'), Buffer.from([1, 0]), Buffer.from('\0\0'), deflateSync(Buffer.from(workflow)),
    ])
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write('iTXt', 4, 4, 'ascii')
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      head, data, Buffer.alloc(4),
    ]))

    expect(parseMetadata(file)).toMatchObject({ hasMetadata: true, nodeTypes: ['CompressedNode'] })
  })

  it('preserves node types and embedded source hints', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'workflow.png')
    writeFileSync(file, pngWithWorkflow({ nodes: [
      { type: 'LoadImage' },
      { type: 'ImpactWildcardProcessor', properties: { cnr_id: 'comfyui-impact-pack', repo_url: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack' } },
    ] }))

    expect(parseMetadata(file)).toMatchObject({
      hasMetadata: true,
      generator: 'ComfyUI',
      nodeTypes: ['LoadImage', 'ImpactWildcardProcessor'],
      sourceHints: [{ nodeType: 'ImpactWildcardProcessor', registryId: 'comfyui-impact-pack', repository: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack' }],
    })
  })

  it('derives node types from a ComfyUI API prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'prompt.png')
    writeFileSync(file, pngWithWorkflow({
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'anime.safetensors' } },
      '2': { class_type: 'KSampler', inputs: {} },
    }))

    expect(parseMetadata(file)).toMatchObject({
      hasMetadata: true,
      generator: 'ComfyUI',
      nodeTypes: ['CheckpointLoaderSimple', 'KSampler'],
      model: 'anime.safetensors',
    })
  })

  it('keeps workflow node details when a prompt chunk is also present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'combined.png')
    writeFileSync(file, pngWithMetadata(
      { nodes: [{ type: 'ImpactWildcardProcessor', properties: { cnr_id: 'comfyui-impact-pack' } }] },
      { '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'anime.safetensors' } } },
    ))

    expect(parseMetadata(file)).toMatchObject({
      model: 'anime.safetensors',
      nodeTypes: ['ImpactWildcardProcessor'],
      sourceHints: [{ nodeType: 'ImpactWildcardProcessor', registryId: 'comfyui-impact-pack' }],
    })
  })

  it('reads LoRA names and weights from WebUI prompt metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'webui-lora.png')
    writeFileSync(file, pngWithParameters(
      '1girl, <lora:animeLine_v2:0.75>, city, <lora:detail boost:1.2>\n' +
      'Negative prompt: blurry\nSteps: 20, Sampler: Euler, CFG scale: 7, Seed: 42, Size: 768x1024',
    ))

    expect(parseMetadata(file)).toMatchObject({
      hasMetadata: true,
      generator: 'WebUI',
      loras: [
        { name: 'animeLine_v2', weight: 0.75 },
        { name: 'detail boost', weight: 1.2 },
      ],
    })
  })

  it('reads active WeiLin LoRAs and preserves every original PNG metadata chunk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'weilin-lora.png')
    const activeLoras = [
      { name: 'detail\\marl_texture', display_name: 'Marl texture clothing', weight: 1, text_encoder_weight: 0.8, hidden: false },
      { name: 'style\\mikage', display_name: 'mikage style', weight: 0.4, text_encoder_weight: 1, hidden: false },
      { name: 'style\\hidden', weight: 0.7, text_encoder_weight: 1, hidden: true },
      { name: 'style\\mikage', display_name: 'mikage style', weight: 0.4, text_encoder_weight: 1, hidden: false },
    ]
    const temporaryLoras = [
      { name: 'history\\not-active', display_name: 'Not active', weight: 0.9, text_encoder_weight: 1, hidden: false },
    ]
    const prompt = {
      '214': {
        class_type: 'WeiLinLoraLoader',
        inputs: {
          lora_str: JSON.stringify(activeLoras),
          temp_lora_str: JSON.stringify(temporaryLoras),
        },
      },
    }
    const workflow = { nodes: [{ type: 'WeiLinLoraLoader' }] }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('workflow', JSON.stringify(workflow)),
      pngTextChunk('prompt', JSON.stringify(prompt)),
      pngTextChunk('custom-field', 'keep this custom metadata value'),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.loras).toEqual([
      { name: 'detail\\marl_texture', displayName: 'Marl texture clothing', weight: 1, textEncoderWeight: 0.8 },
      { name: 'style\\mikage', displayName: 'mikage style', weight: 0.4, textEncoderWeight: 1 },
    ])
    expect(metadata.rawMetadata).toEqual({
      workflow: JSON.stringify(workflow),
      prompt: JSON.stringify(prompt),
      'custom-field': 'keep this custom metadata value',
    })
  })

  it('shows the real prompt inside annotation XML instead of the XML itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'annotation-prompt.png')
    const text = '<image_annotation><caption>long description, with commas</caption></image_annotation>, 0.8, 0.8, {"selections":[{"post_id":"1","prompt":"1girl, blue hair, bird"}]}'
    const prompt = { '1': { class_type: 'AnnotationSaver', inputs: { text } } }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('prompt', JSON.stringify(prompt)),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt).toBe('1girl, blue hair, bird')
  })

  it('recovers ComfyUI metadata when prompt JSON contains NaN values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'nan-prompt.png')
    const rawPrompt = '{"1":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"anime.safetensors"}},"2":{"class_type":"SomeNode","inputs":{"changed": NaN}},"3":{"class_type":"CLIPTextEncode","inputs":{"text":"1girl, blue hair, bird"}}}'
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('prompt', rawPrompt),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata).toMatchObject({
      generator: 'ComfyUI',
      model: 'anime.safetensors',
      prompt: '1girl, blue hair, bird',
    })
  })
})

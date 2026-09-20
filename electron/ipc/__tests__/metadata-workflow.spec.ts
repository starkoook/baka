import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { parseMetadata, parseComfyUIPrompt, extractPromptsFromLiteGraph, cleanPromptText, isModelLoraBlobPrompt } from '../metadata.js'

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

  it('does not treat a model filename plus LoRA JSON as the positive prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'lora-json-not-prompt.png')
    const style = '\u98ce\u683c'
    const loraItem = {
      name: `krea2${style}\\wlop_c1-st4000`,
      weight: 0.4,
      text_encoder_weight: 1,
      hidden: false,
      display_name: `krea2${style}\\wlop_c1-st4000.safetensors`,
      lora: `krea2${style}\\wlop_c1-st4000.safetensors`,
      trigger_weight: 1,
      loraWorks: '',
    }
    const loraStr = JSON.stringify([loraItem])
    const userSample = `qwen3vl_4b_fp8_scaled (1).safetensors, ${loraStr}`
    const prompt = {
      '1': {
        class_type: 'UNETLoader',
        inputs: {
          unet_name: 'qwen3vl_4b_fp8_scaled (1).safetensors',
          text: userSample,
        },
      },
      '2': {
        class_type: 'WeiLinLoraLoader',
        inputs: { lora_str: loraStr },
      },
    }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('prompt', JSON.stringify(prompt)),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt).not.toEqual(userSample)
    expect(metadata.prompt ?? '').not.toContain('text_encoder_weight')
    expect(metadata.prompt ?? '').not.toContain('loraWorks')
    expect(metadata.prompt ?? '').not.toMatch(/\.safetensors/i)
    expect(metadata.loras).toEqual([
      {
        name: `krea2${style}\\wlop_c1-st4000`,
        displayName: `krea2${style}\\wlop_c1-st4000.safetensors`,
        weight: 0.4,
        textEncoderWeight: 1,
      },
    ])
  })

  it('still reads a normal CLIPTextEncode caption as the prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'clip-prompt.png')
    const prompt = {
      '1': {
        class_type: 'CLIPTextEncode',
        inputs: { text: '1girl, solo, blue hair, looking at viewer' },
      },
      '2': {
        class_type: 'WeiLinLoraLoader',
        inputs: {
          lora_str: JSON.stringify([
            { name: 'style\\foo', weight: 0.5, text_encoder_weight: 1, hidden: false },
          ]),
        },
      },
    }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('prompt', JSON.stringify(prompt)),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt).toBe('1girl, solo, blue hair, looking at viewer')
    expect(metadata.loras).toEqual([
      { name: 'style\\foo', weight: 0.5, textEncoderWeight: 1 },
    ])
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

  it('does not treat a raw prompt-chunk model+LoRA blob as a caption', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'raw-prompt-blob.png')
    const style = '\u98ce\u683c'
    const blobLoras = [
      {
        name: `krea2${style}\\wlop_c1-st4000`,
        weight: 0.4,
        text_encoder_weight: 1,
        hidden: false,
        display_name: `krea2${style}\\wlop_c1-st4000.safetensors`,
        lora: `krea2${style}\\wlop_c1-st4000.safetensors`,
        trigger_weight: 1,
        loraWorks: '',
      },
      {
        name: `krea2${style}\\second`,
        weight: 0.4,
        text_encoder_weight: 1,
        hidden: false,
        display_name: `krea2${style}\\second.safetensors`,
        lora: `krea2${style}\\second.safetensors`,
        trigger_weight: 1,
        loraWorks: '',
      },
      {
        name: 'detail\\boost',
        weight: 0.5,
        text_encoder_weight: 1,
        hidden: false,
        display_name: 'detail\\boost.safetensors',
        lora: 'detail\\boost.safetensors',
        trigger_weight: 1,
        loraWorks: '',
      },
      {
        name: 'style\\full',
        weight: 1,
        text_encoder_weight: 1,
        hidden: false,
        display_name: 'style\\full.safetensors',
        lora: 'style\\full.safetensors',
        trigger_weight: 1,
        loraWorks: '',
      },
    ]
    const userSample = `qwen3vl_4b_fp8_scaled (1).safetensors, ${JSON.stringify(blobLoras)}`
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('prompt', userSample),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt ?? '').toBe('')
    expect(metadata.model).toEqual(expect.stringContaining('qwen3vl'))
    expect(metadata.loras).toHaveLength(4)
    expect(metadata.loras.map((lora) => lora.weight)).toEqual([0.4, 0.4, 0.5, 1])
    expect(metadata.rawMetadata?.prompt).toBeUndefined()
    expect(JSON.stringify(metadata.rawMetadata ?? {})).not.toContain('text_encoder_weight')
  })

  it('does not treat a WebUI parameters first-line model+LoRA blob as a caption', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'parameters-blob.png')
    const style = '\u98ce\u683c'
    const blobLoras = [
      { name: `krea2${style}\\wlop_c1-st4000`, weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'a.safetensors', lora: 'a.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'second', weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'b.safetensors', lora: 'b.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'third', weight: 0.5, text_encoder_weight: 1, hidden: false, display_name: 'c.safetensors', lora: 'c.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'fourth', weight: 1, text_encoder_weight: 1, hidden: false, display_name: 'd.safetensors', lora: 'd.safetensors', trigger_weight: 1, loraWorks: '' },
    ]
    const userSample = `qwen3vl_4b_fp8_scaled (1).safetensors, ${JSON.stringify(blobLoras)}`
    writeFileSync(file, pngWithParameters(userSample + '\nNegative prompt: blurry\nSteps: 20, Sampler: Euler, CFG scale: 7, Seed: 1, Size: 768x1024'))

    const metadata = parseMetadata(file)

    expect(metadata.prompt ?? '').toBe('')
    expect(metadata.model).toEqual(expect.stringContaining('qwen3vl'))
    expect(metadata.loras).toHaveLength(4)
    expect(metadata.loras.map((lora) => lora.weight)).toEqual([0.4, 0.4, 0.5, 1])
    expect(metadata.rawMetadata?.parameters ?? '').not.toMatch(/^qwen3vl/)
    expect(metadata.rawMetadata?.parameters ?? '').not.toContain('text_encoder_weight')
  })

  it('still treats 1girl, solo as a prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'normal-prompt.png')
    writeFileSync(file, pngWithParameters('1girl, solo\nNegative prompt: blurry'))

    const metadata = parseMetadata(file)

    expect(metadata.prompt).toBe('1girl, solo')
  })


  it('does not treat an XML-embedded model+LoRA blob as the positive prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'xml-blob-prompt.png')
    const style = '\u98ce\u683c'
    const blobLoras = [
      { name: `krea2${style}\\wlop_c1-st4000`, weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'a.safetensors', lora: 'a.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'second', weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'b.safetensors', lora: 'b.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'third', weight: 0.5, text_encoder_weight: 1, hidden: false, display_name: 'c.safetensors', lora: 'c.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'fourth', weight: 1, text_encoder_weight: 1, hidden: false, display_name: 'd.safetensors', lora: 'd.safetensors', trigger_weight: 1, loraWorks: '' },
    ]
    const userSample = `qwen3vl_4b_fp8_scaled (1).safetensors, ${JSON.stringify(blobLoras)}`
    const text = `<image_annotation><caption>long description, with commas</caption></image_annotation>, 0.8, 0.8, {"selections":[{"post_id":"1","prompt":${JSON.stringify(userSample)}}]}`
    const prompt = { '1': { class_type: 'AnnotationSaver', inputs: { text } } }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('prompt', JSON.stringify(prompt)),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt ?? '').toBe('')
    expect(metadata.prompt ?? '').not.toContain('loraWorks')
    expect(metadata.prompt ?? '').not.toMatch(/\.safetensors/i)
  })

  it('does not treat a widgets_values model+LoRA blob as the positive prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'widgets-blob-prompt.png')
    const style = '\u98ce\u683c'
    const blobLoras = [
      { name: `krea2${style}\\wlop_c1-st4000`, weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'a.safetensors', lora: 'a.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'second', weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'b.safetensors', lora: 'b.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'third', weight: 0.5, text_encoder_weight: 1, hidden: false, display_name: 'c.safetensors', lora: 'c.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'fourth', weight: 1, text_encoder_weight: 1, hidden: false, display_name: 'd.safetensors', lora: 'd.safetensors', trigger_weight: 1, loraWorks: '' },
    ]
    const userSample = `qwen3vl_4b_fp8_scaled (1).safetensors, ${JSON.stringify(blobLoras)}`
    const prompt = {
      '1': {
        class_type: 'UNETLoader',
        inputs: { unet_name: 'qwen3vl_4b_fp8_scaled (1).safetensors' },
        widgets_values: [userSample],
      },
    }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('prompt', JSON.stringify(prompt)),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt ?? '').toBe('')
    expect(metadata.prompt ?? '').not.toContain('loraWorks')
    expect(metadata.model).toEqual(expect.stringContaining('qwen3vl'))
    expect(metadata.loras).toHaveLength(4)
  })

  it('still reads a real caption from widgets_values XML', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'widgets-xml-prompt.png')
    const text = '<image_annotation><caption>long description, with commas</caption></image_annotation>, 0.8, 0.8, {"selections":[{"post_id":"1","prompt":"1girl, blue hair, bird"}]}'
    const prompt = { '1': { class_type: 'AnnotationSaver', inputs: {}, widgets_values: [text] } }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('prompt', JSON.stringify(prompt)),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt).toBe('1girl, blue hair, bird')
  })
  it('reads CLIPTextEncode caption from workflow when prompt chunk is a model+LoRA blob', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'workflow-clip-plus-blob.png')
    const style = '\u98ce\u683c'
    const blobLoras = [
      { name: `krea2${style}\\wlop_c1-st4000`, weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'a.safetensors', lora: 'a.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: `krea2${style}\\second`, weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'b.safetensors', lora: 'b.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'detail\\boost', weight: 0.5, text_encoder_weight: 1, hidden: false, display_name: 'c.safetensors', lora: 'c.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'style\\full', weight: 1, text_encoder_weight: 1, hidden: false, display_name: 'd.safetensors', lora: 'd.safetensors', trigger_weight: 1, loraWorks: '' },
    ]
    const userSample = `qwen3vl_4b_fp8_scaled (1).safetensors, ${JSON.stringify(blobLoras)}`
    const workflow = {
      nodes: [
        { type: 'CLIPTextEncode', widgets_values: ['1girl, solo, long hair'] },
      ],
    }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('workflow', JSON.stringify(workflow)),
      pngTextChunk('prompt', userSample),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt).toEqual(expect.stringContaining('1girl'))
    expect(metadata.prompt ?? '').not.toMatch(/safetensors/i)
    expect(metadata.prompt ?? '').not.toContain('loraWorks')
    expect(JSON.stringify(metadata.prompt ?? '')).not.toMatch(/"lora"\s*:/)
    expect(metadata.model).toEqual(expect.stringContaining('qwen3vl'))
    expect(metadata.loras).toHaveLength(4)
  })

  it('keeps prompt empty for a blob-only image with no CLIP node', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'blob-only-no-clip.png')
    const style = '\u98ce\u683c'
    const blobLoras = [
      { name: `krea2${style}\\wlop_c1-st4000`, weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'a.safetensors', lora: 'a.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'second', weight: 0.4, text_encoder_weight: 1, hidden: false, display_name: 'b.safetensors', lora: 'b.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'third', weight: 0.5, text_encoder_weight: 1, hidden: false, display_name: 'c.safetensors', lora: 'c.safetensors', trigger_weight: 1, loraWorks: '' },
      { name: 'fourth', weight: 1, text_encoder_weight: 1, hidden: false, display_name: 'd.safetensors', lora: 'd.safetensors', trigger_weight: 1, loraWorks: '' },
    ]
    const userSample = `qwen3vl_4b_fp8_scaled (1).safetensors, ${JSON.stringify(blobLoras)}`
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('workflow', JSON.stringify({ nodes: [{ type: 'UNETLoader' }] })),
      pngTextChunk('prompt', userSample),
    ]))

    const metadata = parseMetadata(file)

    expect(metadata.prompt ?? '').toBe('')
    expect(metadata.model).toEqual(expect.stringContaining('qwen3vl'))
    expect(metadata.loras).toHaveLength(4)
  })


  it('reads WeiLinPromptUIWithoutLora artwork XML via CLIP link and ignores lora_str', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baka-meta-'))
    const file = join(dir, 'weilin-artwork-link.png')
    const artwork = '<artwork id="celestial_conservatory_waltz_masterpiece"><scene>glass conservatory waltz</scene></artwork>'
    const loraStr = JSON.stringify([{
      name: 'krea2\\style',
      weight: 0.4,
      text_encoder_weight: 1,
      hidden: false,
      display_name: 'krea2.safetensors',
      lora: 'krea2.safetensors',
      loraWorks: '',
    }])
    const prompt = {
      '97': {
        class_type: 'CLIPTextEncode',
        inputs: { text: ['103', 0] },
        widgets_values: ['3d,yelan,'],
      },
      '102': {
        class_type: 'WeiLinPromptUIOnlyLoraStack',
        inputs: { lora_str: loraStr },
      },
      '103': {
        class_type: 'WeiLinPromptUIWithoutLora',
        inputs: { positive: artwork },
        widgets_values: [artwork],
      },
    }
    const workflow = {
      nodes: [
        { type: 'CLIPTextEncode', widgets_values: ['3d,yelan,'] },
        { type: 'WeiLinPromptUIOnlyLoraStack', widgets_values: [loraStr] },
        { type: 'WeiLinPromptUIWithoutLora', widgets_values: [artwork] },
      ],
    }
    writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngTextChunk('workflow', JSON.stringify(workflow)),
      pngTextChunk('prompt', JSON.stringify(prompt)),
    ]))

    const api = parseComfyUIPrompt(JSON.stringify(prompt))
    expect(api.prompt ?? '').toMatch(/celestial_conservatory|artwork/)
    expect(api.prompt ?? '').not.toContain('loraWorks')
    expect(api.prompt ?? '').not.toContain('text_encoder_weight')
    expect(JSON.stringify(api.prompt ?? '')).not.toMatch(/"lora"\s*:/)

    const lite = extractPromptsFromLiteGraph(workflow.nodes)
    expect(lite.prompt ?? '').toMatch(/celestial_conservatory|artwork/)
    expect(lite.prompt ?? '').not.toContain('loraWorks')

    const metadata = parseMetadata(file)
    expect(metadata.prompt ?? '').toMatch(/celestial_conservatory|artwork/)
    expect(metadata.prompt ?? '').not.toContain('loraWorks')
    expect(metadata.prompt ?? '').not.toContain('text_encoder_weight')
    expect(JSON.stringify(metadata.prompt ?? '')).not.toMatch(/"lora"\s*:/)
  })
  it('cleanPromptText keeps WeiLin artwork XML even if it mentions weights', () => {
    const xml = '<artwork id="celestial_conservatory_waltz_masterpiece"><note>turbo.safetensors, [{"lora":"a.safetensors","text_encoder_weight":1,"loraWorks":""}]</note></artwork>'
    expect(cleanPromptText(xml)).toBe(xml)
    expect(isModelLoraBlobPrompt(xml)).toBe(false)
    expect(isModelLoraBlobPrompt('turbo.safetensors, [{"lora":"a.safetensors","text_encoder_weight":1,"loraWorks":""}]')).toBe(true)
  })
})

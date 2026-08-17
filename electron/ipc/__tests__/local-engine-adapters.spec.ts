import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildComfyImg2ImgPrompt, buildComfyInpaintPrompt, getComfyObjectInfo, healthComfy, listComfyModels } from '../local-engine/comfy.js'
import { editWithWebUI, healthWebUI, listWebUIModels } from '../local-engine/webui.js'

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('local engine adapters', () => {
  it('reads ComfyUI node types and checkpoint choices', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
      CheckpointLoaderSimple: { input: { required: { ckpt_name: [['anime.safetensors']] } } },
      LoadImage: { input: { required: {} } },
    }) })))
    const info = await getComfyObjectInfo('http://127.0.0.1:8188/')
    expect(Object.keys(info)).toContain('LoadImage')
    expect(await listComfyModels('http://127.0.0.1:8188')).toEqual(['anime.safetensors'])
  })

  it('uses WebUI img2img and returns a data URL', async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/sd-models') ? [{ title: 'anime' }] : { images: ['QUJD'] } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await listWebUIModels('http://127.0.0.1:7860')).toEqual(['anime'])
    expect(await editWithWebUI({ baseUrl: 'http://127.0.0.1:7860', imageBase64: 'QUJD', prompt: '夜景', width: 512, height: 512 })).toEqual('data:image/png;base64,QUJD')
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:7860/sdapi/v1/img2img', expect.objectContaining({ method: 'POST' }))
  })

  it('reports health without leaking a failed fetch exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(healthComfy('http://127.0.0.1:8188')).resolves.toMatchObject({ healthy: false })
    await expect(healthWebUI('http://127.0.0.1:7860')).resolves.toMatchObject({ healthy: false })
  })

  it('builds a built-in-only ComfyUI img2img prompt', () => {
    const prompt = buildComfyImg2ImgPrompt({ imageName: 'baka-input.png', model: 'anime.safetensors', prompt: '夜景', negativePrompt: '', seed: 1, steps: 20, cfg: 7 })
    const types = Object.values(prompt).map((node: any) => node.class_type)
    expect(types).toEqual(expect.arrayContaining(['CheckpointLoaderSimple', 'LoadImage', 'KSampler', 'SaveImage']))
    expect(Object.values(prompt).flatMap((node: any) => Object.values(node.inputs))).toContainEqual(['3', 0])
  })

  it('builds a ComfyUI inpaint prompt with a mask', () => {
    const prompt = buildComfyInpaintPrompt({ imageName: 'input.png', maskName: 'mask.png', model: 'anime.safetensors', prompt: '修复手部', seed: 1, steps: 20, cfg: 7 })
    const types = Object.values(prompt).map((node: any) => node.class_type)
    expect(types).toContain('SetLatentNoiseMask')
    expect(Object.values(prompt).find((node: any) => node.class_type === 'LoadImage' && node.inputs.image === 'mask.png')).toBeTruthy()
  })
})

function baseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

async function request(url, route, options = {}) {
  const response = await fetch(`${baseUrl(url)}${route}`, options)
  if (!response.ok) throw new Error(`ComfyUI 请求失败 (${response.status || '未知状态'})`)
  return response
}

async function getComfyObjectInfo(url) {
  return (await request(url, '/object_info')).json()
}

async function healthComfy(url) {
  try {
    await getComfyObjectInfo(url)
    return { healthy: true }
  } catch (error) {
    return { healthy: false, error: error.message }
  }
}

async function listComfyModels(url) {
  const info = await getComfyObjectInfo(url)
  const choices = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]
  return Array.isArray(choices) ? choices : []
}

function buildComfyImg2ImgPrompt({ imageName, model, prompt, negativePrompt = '', seed, steps, cfg, denoise = 0.65 }) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    '2': { class_type: 'LoadImage', inputs: { image: imageName } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: prompt || '', clip: ['1', 1] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['1', 1] } },
    '5': { class_type: 'VAEEncode', inputs: { pixels: ['2', 0], vae: ['1', 2] } },
    '6': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0], seed: Number(seed) || 0, steps: Number(steps) || 20, cfg: Number(cfg) || 7, sampler_name: 'euler', scheduler: 'normal', denoise: Number(denoise) || 0.65 } },
    '7': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
    '8': { class_type: 'SaveImage', inputs: { filename_prefix: 'baka-tools', images: ['7', 0] } },
  }
}

function buildComfyInpaintPrompt({ imageName, maskName, model, prompt, negativePrompt = '', seed, steps, cfg, denoise = 0.9 }) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: model } },
    '2': { class_type: 'LoadImage', inputs: { image: imageName } },
    '3': { class_type: 'LoadImage', inputs: { image: maskName } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: prompt || '', clip: ['1', 1] } },
    '5': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['1', 1] } },
    '6': { class_type: 'VAEEncode', inputs: { pixels: ['2', 0], vae: ['1', 2] } },
    '7': { class_type: 'SetLatentNoiseMask', inputs: { samples: ['6', 0], mask: ['3', 0] } },
    '8': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['7', 0], seed: Number(seed) || 0, steps: Number(steps) || 20, cfg: Number(cfg) || 7, sampler_name: 'euler', scheduler: 'normal', denoise: Number(denoise) || 0.9 } },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['1', 2] } },
    '10': { class_type: 'SaveImage', inputs: { filename_prefix: 'baka-tools-inpaint', images: ['9', 0] } },
  }
}

function dataUrlParts(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''))
  return match ? { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') } : null
}

async function editWithComfy({ baseUrl: url, imageBase64, maskImageBase64, mimeType = 'image/png', prompt, negativePrompt, model, seed, steps, cfg, timeoutMs = 120000, pollMs = 500 }) {
  const parts = dataUrlParts(imageBase64)
  const form = new FormData()
  const payload = parts ? parts.buffer : Buffer.from(imageBase64, 'base64')
  form.append('image', new Blob([payload], { type: parts?.mimeType || mimeType }), 'baka-input.png')
  const upload = await (await request(url, '/upload/image', { method: 'POST', body: form })).json()
  const imageName = upload.name || upload.filename
  if (!imageName) throw new Error('ComfyUI 没有返回上传文件名')

  let workflow
  if (maskImageBase64) {
    const maskParts = dataUrlParts(maskImageBase64)
    const maskPayload = maskParts ? maskParts.buffer : Buffer.from(maskImageBase64, 'base64')
    const maskForm = new FormData()
    maskForm.append('image', new Blob([maskPayload], { type: maskParts?.mimeType || mimeType }), 'baka-mask.png')
    const maskUpload = await (await request(url, '/upload/image', { method: 'POST', body: maskForm })).json()
    const maskName = maskUpload.name || maskUpload.filename
    if (!maskName) throw new Error('ComfyUI 没有返回遮罩文件名')
    workflow = buildComfyInpaintPrompt({ imageName, maskName, model, prompt, negativePrompt, seed, steps, cfg })
  } else {
    workflow = buildComfyImg2ImgPrompt({ imageName, model, prompt, negativePrompt, seed, steps, cfg })
  }

  const submitted = await (await request(url, '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow }) })).json()
  const promptId = submitted.prompt_id
  if (!promptId) throw new Error('ComfyUI 没有返回任务标识')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const history = await (await request(url, `/history/${encodeURIComponent(promptId)}`)).json()
    const outputs = history?.[promptId]?.outputs || history?.outputs
    const image = Object.values(outputs || {}).flatMap(output => output.images || [])[0]
    if (image?.filename) {
      const params = new URLSearchParams({ filename: image.filename, type: image.type || 'output' })
      if (image.subfolder) params.set('subfolder', image.subfolder)
      const result = await request(url, `/view?${params}`)
      const bytes = Buffer.from(await result.arrayBuffer())
      return `data:${mimeType};base64,${bytes.toString('base64')}`
    }
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
  throw new Error('ComfyUI 生成超时')
}

module.exports = { healthComfy, getComfyObjectInfo, listComfyModels, buildComfyImg2ImgPrompt, buildComfyInpaintPrompt, editWithComfy }

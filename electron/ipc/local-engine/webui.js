function baseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

async function request(url, route, options = {}) {
  const response = await fetch(`${baseUrl(url)}${route}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  if (!response.ok) throw new Error(`WebUI 请求失败 (${response.status || '未知状态'})`)
  return response.json()
}

async function healthWebUI(url) {
  try {
    await request(url, '/sdapi/v1/options')
    return { healthy: true }
  } catch (error) {
    return { healthy: false, error: error.message }
  }
}

async function listWebUIModels(url) {
  const models = await request(url, '/sdapi/v1/sd-models')
  return Array.isArray(models) ? models.map(model => model.title || model.model_name).filter(Boolean) : []
}

async function editWithWebUI({ baseUrl: url, imageBase64, maskImageBase64, prompt, negativePrompt = '', model, width, height }) {
  if (model) await request(url, '/sdapi/v1/options', { method: 'POST', body: JSON.stringify({ sd_model_checkpoint: model }) })
  const body = {
    init_images: [imageBase64], prompt, negative_prompt: negativePrompt,
    width: Number(width) || 1024, height: Number(height) || 1024, denoising_strength: 0.65,
  }
  if (maskImageBase64) {
    Object.assign(body, {
      mask: maskImageBase64,
      mask_blur: 4,
      inpainting_fill: 1,
      inpaint_full_res: true,
      inpaint_full_res_padding: 32,
    })
  }
  const data = await request(url, '/sdapi/v1/img2img', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!data.images?.[0]) throw new Error('WebUI 没有返回图片')
  return `data:image/png;base64,${data.images[0]}`
}

module.exports = { healthWebUI, listWebUIModels, editWithWebUI }

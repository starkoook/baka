import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('llm imageGeneration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('调用 OpenAI 兼容 /images/generations 并返回 b64 图片', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJD' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { imageGeneration } = await import('../llm.js')
    const result = await imageGeneration({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      apiKey: 'k',
      model: 'gpt-image-1',
      prompt: '一只猫',
      size: '1024x1024',
    })

    expect(result.success).toBe(true)
    expect(result.images?.[0]).toBe('data:image/png;base64,QUJD')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/images/generations',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('图生图走 /images/edits 并返回图片', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: 'QUJD' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { imageGeneration } = await import('../llm.js')
    const result = await imageGeneration({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      apiKey: 'k',
      model: 'gpt-image-1',
      prompt: '改成红色',
      imageBase64: 'QUJD',
      mimeType: 'image/png',
    })

    expect(result.success).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/v1/images/edits')
  })

  it('接口失败时返回 error', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    }))

    const { imageGeneration } = await import('../llm.js')
    const result = await imageGeneration({
      provider: 'openai',
      baseUrl: 'https://example.com/v1',
      apiKey: 'k',
      model: 'gpt-image-1',
      prompt: '一只猫',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('400')
  })
})

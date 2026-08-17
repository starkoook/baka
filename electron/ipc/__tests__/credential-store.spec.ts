import { describe, expect, it } from 'vitest'
import { mergeDecrypted, protectApiKeyFields, restoreApiKeyFields, splitAndEncrypt } from '../credential-store.js'

const fakeSafeStorage = {
  encryptString(value) {
    return Buffer.from('enc:' + value, 'utf8')
  },
  decryptString(buffer) {
    return buffer.toString('utf8').slice(4)
  },
}

describe('credential store', () => {
  it('moves secrets out of settings and encrypts them', () => {
    const config = { provider: 'openai', apiKey: 'sk-secret', apiKeys: ['a', 'b'], model: 'gpt-4o' }
    const { settings, credentials } = splitAndEncrypt(config, fakeSafeStorage)

    expect(settings.apiKey).toBeUndefined()
    expect(settings.apiKeys).toBeUndefined()
    expect(settings.model).toBe('gpt-4o')
    expect(credentials.apiKey).toBeTruthy()
    expect(credentials.apiKey).not.toBe('sk-secret')
    expect(credentials.apiKey).not.toContain('sk-secret')
  })

  it('merges decrypted secrets back into settings', () => {
    const settings = { provider: 'openai', model: 'gpt-4o' }
    const credentials = {
      apiKey: Buffer.from('enc:"sk-secret"', 'utf8').toString('base64'),
      apiKeys: Buffer.from('enc:["a","b"]', 'utf8').toString('base64'),
    }

    const merged = mergeDecrypted(settings, credentials, fakeSafeStorage)

    expect(merged.apiKey).toBe('sk-secret')
    expect(merged.apiKeys).toEqual(['a', 'b'])
    expect(merged.model).toBe('gpt-4o')
  })

  it('protects and restores nested apiKey fields', () => {
    const data = {
      profiles: [{ name: 'a', apiKey: 'sk-1' }],
      credentials: { danbooru: { username: 'u', apiKey: 'k2' } },
    }

    const protectedData = protectApiKeyFields(data, fakeSafeStorage)
    expect(protectedData.profiles[0].apiKey).toBeUndefined()
    expect(protectedData.profiles[0].encryptedApiKey).toBeTruthy()
    expect(protectedData.credentials.danbooru.apiKey).toBeUndefined()

    const restored = restoreApiKeyFields(protectedData, fakeSafeStorage)
    expect(restored.profiles[0].apiKey).toBe('sk-1')
    expect(restored.credentials.danbooru.apiKey).toBe('k2')
  })
})

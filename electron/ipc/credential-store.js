function encryptSecret(value, safeStorage) {
  const plain = JSON.stringify(value)
  const encrypted = safeStorage.encryptString(plain)
  return Buffer.from(encrypted).toString('base64')
}

function decryptSecret(encrypted, safeStorage) {
  try {
    const buffer = Buffer.from(encrypted, 'base64')
    const plain = safeStorage.decryptString(buffer)
    return JSON.parse(plain)
  } catch (_) {
    return null
  }
}

const SECRET_KEYS = ['apiKey', 'apiKeys']

function splitAndEncrypt(config, safeStorage) {
  const settings = { ...config }
  const credentials = {}
  for (const key of SECRET_KEYS) {
    if (settings[key] != null && settings[key] !== '') {
      credentials[key] = encryptSecret(settings[key], safeStorage)
      delete settings[key]
    }
  }
  return { settings, credentials }
}

function mergeDecrypted(settings, credentials, safeStorage) {
  const merged = { ...settings }
  for (const key of SECRET_KEYS) {
    const encrypted = credentials?.[key]
    if (encrypted != null) {
      const value = decryptSecret(encrypted, safeStorage)
      if (value != null) merged[key] = value
    }
  }
  return merged
}

function protectApiKeyFields(obj, safeStorage) {
  if (Array.isArray(obj)) return obj.map((item) => protectApiKeyFields(item, safeStorage))
  if (!obj || typeof obj !== 'object') return obj

  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'apiKey' && value != null && value !== '') {
      out.encryptedApiKey = encryptSecret(value, safeStorage)
    } else if (key === 'apiKeys' && Array.isArray(value) && value.length > 0) {
      out.encryptedApiKeys = encryptSecret(value, safeStorage)
    } else {
      out[key] = protectApiKeyFields(value, safeStorage)
    }
  }
  return out
}

function restoreApiKeyFields(obj, safeStorage) {
  if (Array.isArray(obj)) return obj.map((item) => restoreApiKeyFields(item, safeStorage))
  if (!obj || typeof obj !== 'object') return obj

  const out = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'encryptedApiKey') {
      const decrypted = decryptSecret(value, safeStorage)
      if (decrypted != null) out.apiKey = decrypted
    } else if (key === 'encryptedApiKeys') {
      const decrypted = decryptSecret(value, safeStorage)
      if (decrypted != null) out.apiKeys = decrypted
    } else {
      out[key] = restoreApiKeyFields(value, safeStorage)
    }
  }
  return out
}

module.exports = {
  encryptSecret,
  decryptSecret,
  splitAndEncrypt,
  mergeDecrypted,
  protectApiKeyFields,
  restoreApiKeyFields,
}

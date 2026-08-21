// 在线画廊主进程接口：多图站搜索、详情、图片代理与下载。
// 通过 undici 使用可配置代理，规避 renderer 的 CORS 限制。

const { app, dialog, net, safeStorage, session } = require('electron')
const fs = require('fs')
const path = require('path')
const { protectApiKeyFields, restoreApiKeyFields } = require('./credential-store')

const PRESET_SITES = [
  { id: 'danbooru', label: 'Danbooru', type: 'danbooru', baseUrl: 'https://danbooru.donmai.us' },
  { id: 'gelbooru', label: 'Gelbooru', type: 'gelbooru', baseUrl: 'https://gelbooru.com' },
  { id: 'safebooru', label: 'Safebooru', type: 'gelbooru', baseUrl: 'https://safebooru.org' },
  { id: 'konachan', label: 'Konachan', type: 'moebooru', baseUrl: 'https://konachan.com' },
  { id: 'yandere', label: 'yande.re', type: 'moebooru', baseUrl: 'https://yande.re' },
  { id: 'e621', label: 'e621', type: 'e621', baseUrl: 'https://e621.net' },
  { id: 'rule34', label: 'rule34.xxx', type: 'gelbooru', baseUrl: 'https://api.rule34.xxx' },
  { id: 'derpibooru', label: 'Derpibooru', type: 'derpibooru', baseUrl: 'https://derpibooru.org' },
  { id: 'atfbooru', label: 'ATFBooru', type: 'gelbooru', baseUrl: 'https://booru.allthefallen.moe' },
]

function dataDir() {
  const dir = path.join(app.getPath('userData'), 'booru-gallery')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir(), file), 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.writeFileSync(path.join(dataDir(), file), JSON.stringify(value, null, 2), 'utf8')
}

function getSafeStorage() {
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      return safeStorage
    }
  } catch (_) {}
  return null
}

function loadSites() {
  const stored = readJson('sites.json', null)
  return Array.isArray(stored) && stored.length ? stored : PRESET_SITES
}

function loadSettings() {
  const fallback = {
    proxy: '',
    timeout: 30,
    credentials: {
      danbooru: { username: '', apiKey: '' },
      gelbooru: { userId: '', apiKey: '' },
      e621: { username: '', apiKey: '' },
      derpibooru: { apiKey: '' },
    },
  }
  const raw = readJson('settings.json', fallback)
  const storage = getSafeStorage()
  return storage ? restoreApiKeyFields(raw, storage) : raw
}

async function getJson(url, options = {}) {
  try {
    const response = await net.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'BakaTools/0.2', ...options.headers } })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(friendlyHttpError(options.label || '图站', response.status, body))
    }
    return await response.json()
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new Error('连接超时：请检查代理是否开启，或把设置里的超时时间调大一些。')
    }
    throw error
  }
}

function friendlyHttpError(label, status, body) {
  const detail = String(body || '').slice(0, 240)
  if (status === 401) return `${label} 返回 401（未授权）。通常是 API Key 没填、填错，或需要登录。请到“设置 → 站点 API 配置”填写正确的密钥/账号。`
  if (status === 403) return `${label} 返回 403（禁止访问）。可能是被站点风控、需要登录，或当前代理 IP 被限制。建议填写 API Key、稍后重试，或更换代理。`
  if (status === 404) return `${label} 返回 404（未找到）。可能是站点地址不对、该内容不存在，或触发限流。请检查网址，稍后再试。`
  if (status === 429) return `${label} 返回 429（请求太频繁）。被限流了，建议稍后再试，或填写该站点的 API Key 提升额度。`
  if (status >= 500) return `${label} 返回 ${status}（服务器错误）。这是图站自身问题，稍后再试即可。`
  return `${label} 请求失败：HTTP ${status}${detail ? `，详情：${detail}` : ''}`
}

function authQuery(site, credentials) {
  const creds = credentials?.[site.id] || {}
  const parts = []
  if (site.type === 'danbooru') {
    if (creds.username) parts.push(`login=${encodeURIComponent(creds.username)}`)
    if (creds.apiKey) parts.push(`api_key=${encodeURIComponent(creds.apiKey)}`)
  } else if (site.type === 'gelbooru') {
    if (creds.userId) parts.push(`user_id=${encodeURIComponent(creds.userId)}`)
    if (creds.apiKey) parts.push(`api_key=${encodeURIComponent(creds.apiKey)}`)
  } else if (site.type === 'e621') {
    if (creds.username) parts.push(`login=${encodeURIComponent(creds.username)}`)
    if (creds.apiKey) parts.push(`api_key=${encodeURIComponent(creds.apiKey)}`)
  } else if (site.type === 'derpibooru') {
    if (creds.apiKey) parts.push(`key=${encodeURIComponent(creds.apiKey)}`)
  }
  return parts.length ? `&${parts.join('&')}` : ''
}

function normRating(value) {
  const v = String(value || '').toLowerCase()
  if (v === 's') return 'sensitive'
  if (v === 'q') return 'questionable'
  if (v === 'e') return 'explicit'
  if (v === 'g') return 'general'
  return v || 'unknown'
}

function normTags(value) {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean)
  if (Array.isArray(value)) return value.map((tag) => String(tag))
  if (value && typeof value === 'object') {
    return Object.values(value).flat().map((tag) => String(tag))
  }
  return []
}

function normTagsForPost(raw) {
  const tagString = raw.tag_string || [
    raw.tag_string_artist,
    raw.tag_string_character,
    raw.tag_string_copyright,
    raw.tag_string_general,
    raw.tag_string_meta,
  ].filter(Boolean).join(' ')
  if (tagString) return tagString.split(/\s+/).filter(Boolean)
  return normTags(raw.tags)
}

function normalizePost(site, raw) {
  if (!raw) return null
  if (site.type === 'e621') {
    const artistTags = normTags(raw.tags).filter((tag) => String(tag).startsWith('artist:'))
    return {
      id: String(raw.id),
      previewUrl: raw.preview?.url || raw.sample?.url || '',
      fileUrl: raw.file?.url || '',
      sampleUrl: raw.sample?.url || raw.file?.url || '',
      rating: normRating(raw.rating),
      tags: normTags(raw.tags),
      width: Number(raw.width) || 0,
      height: Number(raw.height) || 0,
      score: Number(raw.score?.total ?? raw.score) || 0,
      createdAt: raw.created_at || '',
      author: artistTags.map((tag) => String(tag).slice('artist:'.length)).join(', '),
      source: Array.isArray(raw.sources) && raw.sources[0] ? String(raw.sources[0]) : '',
      postUrl: `${site.baseUrl}/posts/${raw.id}`,
      uploader: raw.uploader_id ? String(raw.uploader_id) : '',
      fileSize: Number(raw.file?.size) || 0,
    }
  }
  if (site.type === 'derpibooru') {
    return {
      id: String(raw.id),
      previewUrl: raw.representations?.thumb || raw.representations?.thumb_small || '',
      fileUrl: raw.representations?.full || raw.image || '',
      sampleUrl: raw.representations?.large || raw.representations?.full || '',
      rating: normRating(raw.rating),
      tags: normTags(raw.tags),
      width: Number(raw.width) || 0,
      height: Number(raw.height) || 0,
      score: Number(raw.score) || 0,
      createdAt: raw.created_at || '',
      author: raw.uploader || '',
      source: raw.source_url || raw.source || '',
      postUrl: `${site.baseUrl}/${raw.id}`,
      uploader: raw.uploader || '',
      fileSize: Number(raw.file_size) || 0,
    }
  }
  const artistTags = normTagsForPost(raw).filter((tag) => String(tag).startsWith('artist:'))
  return {
    id: String(raw.id),
    previewUrl: raw.preview_file_url || raw.preview_url || raw.file_url || raw.fileUrl || '',
    fileUrl: raw.file_url || raw.large_file_url || raw.fileUrl || raw.image || '',
    sampleUrl: raw.sample_url || raw.large_file_url || raw.file_url || raw.preview_file_url || raw.preview_url || '',
    rating: normRating(raw.rating),
    tags: normTagsForPost(raw),
    width: Number(raw.image_width ?? raw.width) || 0,
    height: Number(raw.image_height ?? raw.height) || 0,
    score: Number(raw.score) || 0,
    createdAt: raw.created_at || '',
    author: raw.tag_string_artist || artistTags.map((tag) => String(tag).slice('artist:'.length)).join(', '),
    source: raw.source || raw.pixiv_id ? (raw.source || `https://www.pixiv.net/artworks/${raw.pixiv_id}`) : '',
    postUrl: `${site.baseUrl}/posts/${raw.id}`,
    uploader: raw.uploader_name || '',
    fileSize: Number(raw.file_size) || 0,
  }
}

function buildSearchUrl(site, query, page, limit, rating, sort) {
  const tags = [query.trim(), rating && rating !== 'all' ? `rating:${rating}` : '', sort === 'score' ? 'order:score' : '']
    .filter(Boolean).join(' ')
  const encoded = encodeURIComponent(tags)
  const pageNum = Math.max(1, Number(page) || 1)
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 40))

  if (site.type === 'danbooru') {
    return `${site.baseUrl}/posts.json?tags=${encoded}&page=${pageNum}&limit=${limitNum}`
  }
  if (site.type === 'gelbooru') {
    const base = site.baseUrl.replace(/\/$/, '')
    return `${base}/index.php?page=dapi&s=post&q=index&json=1&tags=${encoded}&pid=${pageNum - 1}&limit=${limitNum}`
  }
  if (site.type === 'moebooru') {
    return `${site.baseUrl}/post.json?tags=${encoded}&page=${pageNum}&limit=${limitNum}`
  }
  if (site.type === 'e621') {
    return `${site.baseUrl}/posts.json?tags=${encoded}&page=${pageNum}&limit=${limitNum}`
  }
  if (site.type === 'derpibooru') {
    return `${site.baseUrl}/api/v1/json/search/posts?q=${encoded}&page=${pageNum}&per_page=${limitNum}`
  }
  return `${site.baseUrl}/posts.json?tags=${encoded}&page=${pageNum}&limit=${limitNum}`
}

function buildDetailUrl(site, postId) {
  if (site.type === 'e621') return `${site.baseUrl}/posts/${postId}.json`
  if (site.type === 'derpibooru') return `${site.baseUrl}/api/v1/json/posts/${postId}`
  if (site.type === 'moebooru') return `${site.baseUrl}/post.json?tags=id:${postId}&limit=1`
  if (site.type === 'gelbooru') {
    const base = site.baseUrl.replace(/\/$/, '')
    return `${base}/index.php?page=dapi&s=post&q=index&json=1&id=${postId}`
  }
  return `${site.baseUrl}/posts/${postId}.json`
}

function buildRankingUrl(site, period, page, limit, rating) {
  const pageNum = Math.max(1, Number(page) || 1)
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 40))
  if (site.type === 'danbooru') {
    return `${site.baseUrl}/explore/posts/popular.json?scale=${encodeURIComponent(period)}&page=${pageNum}&limit=${limitNum}`
  }
  if (site.type === 'moebooru') {
    return `${site.baseUrl}/post/popular_by_${encodeURIComponent(period)}.json?page=${pageNum}&limit=${limitNum}`
  }
  throw new Error(`${site.label} 暂不支持排行榜`)
}

function buildTagSuggestUrl(site, prefix, limit) {
  const encoded = encodeURIComponent(String(prefix || ''))
  const limitNum = Math.min(30, Math.max(1, Number(limit) || 12))
  if (site.type === 'danbooru') {
    return `${site.baseUrl}/tags.json?search[name_matches]=${encoded}*&search[order]=count&limit=${limitNum}`
  }
  if (site.type === 'e621') {
    return `${site.baseUrl}/tags.json?search[name_matches]=${encoded}*&limit=${limitNum}`
  }
  if (site.type === 'derpibooru') {
    return `${site.baseUrl}/api/v1/json/search/tags?q=${encoded}*&per_page=${limitNum}`
  }
  throw new Error(`${site.label} 暂不支持标签联想`)
}

function buildRelatedTagsUrl(site, query) {
  const encoded = encodeURIComponent(String(query || '').trim())
  if (!encoded) throw new Error('请输入关键词后再查看关联标签')
  if (site.type === 'danbooru') {
    return `${site.baseUrl}/related_tag.json?query=${encoded}`
  }
  throw new Error(`${site.label} 暂不支持关联标签`)
}

function normalizeTag(site, raw) {
  if (!raw) return null
  return {
    name: String(raw.name || raw.tag || ''),
    count: Number(raw.post_count ?? raw.count ?? raw.postCount ?? 0) || 0,
    category: String(raw.category || '').toLowerCase(),
  }
}

function extractTags(site, payload) {
  if (Array.isArray(payload)) return payload.map((raw) => normalizeTag(site, raw)).filter((tag) => tag?.name)
  if (Array.isArray(payload?.tags)) return payload.tags.map((raw) => normalizeTag(site, raw)).filter((tag) => tag?.name)
  return []
}

function extractPosts(site, payload) {
  if (site.type === 'e621') return (payload?.posts || []).map((raw) => normalizePost(site, raw)).filter(Boolean)
  if (site.type === 'derpibooru') return (payload?.posts || []).map((raw) => normalizePost(site, raw)).filter(Boolean)
  if (Array.isArray(payload)) return payload.map((raw) => normalizePost(site, raw)).filter(Boolean)
  if (Array.isArray(payload?.post)) return payload.post.map((raw) => normalizePost(site, raw)).filter(Boolean)
  return []
}

async function search(siteId, query, page, limit, rating, sort) {
  const site = loadSites().find((item) => item.id === siteId) || PRESET_SITES[0]
  const credentials = loadSettings().credentials || {}
  const url = buildSearchUrl(site, query, page, limit, rating, sort) + authQuery(site, credentials)
  const payload = await getJson(url, { label: site.label })
  const posts = extractPosts(site, payload)
  const ended = posts.length < Math.min(100, Number(limit) || 40)
  return { posts, nextPage: ended ? null : Number(page) + 1, ended }
}

async function detail(siteId, postId) {
  const site = loadSites().find((item) => item.id === siteId) || PRESET_SITES[0]
  const credentials = loadSettings().credentials || {}
  const url = buildDetailUrl(site, postId) + authQuery(site, credentials)
  const payload = await getJson(url, { label: site.label })
  const raws = extractPosts(site, payload)
  if (!raws.length) throw new Error('未找到该图片')
  return { post: raws[0], site: { label: site.label, baseUrl: site.baseUrl, id: site.id } }
}

async function ranking(siteId, period, page, limit, rating) {
  const site = loadSites().find((item) => item.id === siteId) || PRESET_SITES[0]
  const credentials = loadSettings().credentials || {}
  const url = buildRankingUrl(site, period, page, limit, rating) + authQuery(site, credentials)
  const payload = await getJson(url, { label: site.label })
  const posts = extractPosts(site, payload)
  const ended = posts.length < Math.min(100, Number(limit) || 40)
  return { posts, nextPage: ended ? null : Number(page) + 1, ended }
}

async function tagSuggest(siteId, prefix, limit) {
  const site = loadSites().find((item) => item.id === siteId) || PRESET_SITES[0]
  const credentials = loadSettings().credentials || {}
  const url = buildTagSuggestUrl(site, prefix, limit) + authQuery(site, credentials)
  const payload = await getJson(url, { label: site.label })
  return { tags: extractTags(site, payload) }
}

async function relatedTags(siteId, query) {
  const site = loadSites().find((item) => item.id === siteId) || PRESET_SITES[0]
  const credentials = loadSettings().credentials || {}
  const url = buildRelatedTagsUrl(site, query) + authQuery(site, credentials)
  const payload = await getJson(url, { label: site.label })
  return { tags: extractTags(site, payload) }
}

async function proxyImage(url) {
  const response = await net.fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const mime = response.headers.get('content-type') || 'image/jpeg'
  return { base64: buffer.toString('base64'), mime }
}

async function download(url, suggestedName) {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: suggestedName || 'image.jpg',
    filters: [{ name: 'Images', extensions: ['jpg', 'png', 'webp', 'gif'] }],
  })
  if (canceled || !filePath) return { canceled: true }
  const response = await net.fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()))
  return { canceled: false, filePath }
}

async function downloadToFile(url, filePath) {
  const response = await net.fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()))
}

function registerBooruGalleryHandlers(ipcMain) {
  ipcMain.handle('booru:listSites', () => ({ success: true, sites: loadSites() }))
  ipcMain.handle('booru:saveSite', (_event, site) => {
    const sites = loadSites()
    const index = sites.findIndex((item) => item.id === site?.id)
    if (index >= 0) sites[index] = { ...sites[index], ...site }
    else sites.push(site)
    writeJson('sites.json', sites)
    return { success: true, sites }
  })
  ipcMain.handle('booru:deleteSite', (_event, siteId) => {
    const sites = loadSites().filter((item) => item.id !== siteId)
    writeJson('sites.json', sites)
    return { success: true, sites }
  })
  ipcMain.handle('booru:resetSites', () => {
    writeJson('sites.json', PRESET_SITES)
    return { success: true, sites: PRESET_SITES }
  })
  ipcMain.handle('booru:getSettings', () => ({ success: true, settings: loadSettings() }))
  ipcMain.handle('booru:saveSettings', (_event, settings) => {
    const storage = getSafeStorage()
    writeJson('settings.json', storage ? protectApiKeyFields(settings, storage) : settings)
    return { success: true, settings }
  })
  ipcMain.handle('booru:search', async (_event, params) => {
    try {
      const result = await search(params.siteId, params.query, params.page || 1, params.limit || 40, params.rating, params.sort)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('booru:ranking', async (_event, params) => {
    try {
      const result = await ranking(params.siteId, params.period, params.page || 1, params.limit || 40, params.rating)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('booru:tagSuggest', async (_event, params) => {
    try {
      const result = await tagSuggest(params.siteId, params.prefix, params.limit)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('booru:relatedTags', async (_event, params) => {
    try {
      const result = await relatedTags(params.siteId, params.query)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('booru:detail', async (_event, params) => {
    try {
      const result = await detail(params.siteId, params.postId)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('booru:proxyImage', async (_event, url) => {
    try {
      const result = await proxyImage(url)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('booru:download', async (_event, params) => {
    try {
      const result = await download(params.url, params.suggestedName)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('booru:chooseFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择下载文件夹',
      properties: ['openDirectory', 'createDirectory'],
    })
    return { success: !result.canceled, folderPath: result.filePaths?.[0] || '' }
  })
  ipcMain.handle('booru:createFolder', async (_event, parent, name) => {
    try {
      const folderPath = path.join(parent, String(name || '').trim())
      if (!folderPath || folderPath === parent) throw new Error('请输入文件夹名称')
      fs.mkdirSync(folderPath, { recursive: true })
      return { success: true, folderPath }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
  ipcMain.handle('booru:batchDownload', async (event, params) => {
    const items = Array.isArray(params?.items) ? params.items : []
    if (!items.length) return { success: false, error: '没有可下载的图片' }
    const folder = String(params.folder || '').trim()
    if (!folder) return { success: false, error: '请选择下载文件夹' }
    let downloaded = 0
    const failed = []
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      try {
        const filename = String(item.filename || `${index + 1}.jpg`).replace(/[\\/:*?"<>|]/g, '_')
        await downloadToFile(item.url, path.join(folder, filename))
        downloaded += 1
      } catch (error) {
        failed.push({ filename: item.filename, error: error.message })
      }
      event.sender.send('booru:batchProgress', { done: index + 1, total: items.length, current: item.filename })
    }
    return { success: true, downloaded, failed }
  })
}

module.exports = { registerBooruGalleryHandlers, PRESET_SITES, loadSettings }

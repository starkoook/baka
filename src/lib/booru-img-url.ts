/** 渲染进程不能直接吃图站 HTTPS：没 Referer、也不走主进程代理。改走 booruimg://。 */

export function toBooruImgUrl(url: string): string {
  const value = String(url || '').trim()
  if (!value) return ''
  if (value.startsWith('data:') || value.startsWith('booruimg:')) return value
  return 'booruimg://preview/?src=' + encodeURIComponent(value)
}

export function refererForBooruImage(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.endsWith('donmai.us')) return 'https://danbooru.donmai.us/'
    if (host.includes('gelbooru.com')) return 'https://gelbooru.com/'
    if (host.includes('safebooru.org')) return 'https://safebooru.org/'
    if (host.includes('e621.net')) return 'https://e621.net/'
    if (host.includes('e926.net')) return 'https://e926.net/'
    if (host.includes('konachan')) return 'https://konachan.com/'
    if (host.includes('yande.re')) return 'https://yande.re/'
    if (host.includes('derpibooru.org') || host.includes('derpicdn.net')) return 'https://derpibooru.org/'
    if (host.includes('rule34')) return 'https://rule34.xxx/'
    return new URL(url).origin + '/'
  } catch {
    return ''
  }
}

export function booruImageHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'User-Agent': 'BakaTools/0.1',
  }
  const referer = refererForBooruImage(url)
  if (referer) headers.Referer = referer
  return headers
}

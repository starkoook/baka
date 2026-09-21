import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { refererForBooruImage, toBooruImgUrl } from './booru-img-url'

describe('booru image urls', () => {
  it('wraps remote previews so the renderer does not load them as raw https', () => {
    const src = 'https://cdn.donmai.us/preview/ab/cd/abcd.jpg'
    expect(toBooruImgUrl(src)).toBe('booruimg://preview/?src=' + encodeURIComponent(src))
    expect(toBooruImgUrl('')).toBe('')
    expect(toBooruImgUrl('booruimg://preview/?src=already')).toBe('booruimg://preview/?src=already')
    expect(toBooruImgUrl('data:image/jpeg;base64,abc')).toBe('data:image/jpeg;base64,abc')
  })

  it('sends a site referer so CDN hotlink checks accept the preview', () => {
    expect(refererForBooruImage('https://cdn.donmai.us/preview/a.jpg')).toBe('https://danbooru.donmai.us/')
    expect(refererForBooruImage('https://img3.gelbooru.com/thumbnails/0.jpg')).toBe('https://gelbooru.com/')
    expect(refererForBooruImage('https://static1.e621.net/data/preview/0.jpg')).toBe('https://e621.net/')
    expect(refererForBooruImage('not-a-url')).toBe('')
  })

  it('sends grid and detail previews through the main-process booruimg scheme', () => {
    const view = readFileSync(resolve(process.cwd(), 'src/views/BooruGallery.vue'), 'utf8')
    const main = readFileSync(resolve(process.cwd(), 'electron/main.js'), 'utf8')
    const fetch = readFileSync(resolve(process.cwd(), 'electron/ipc/booru-gallery.js'), 'utf8')

    expect(view).toContain('toBooruImgUrl(post.previewUrl || post.sampleUrl)')
    expect(view).toContain('toBooruImgUrl(store.selectedImage)')
    expect(main).toContain("scheme: 'booruimg'")
    expect(main).toContain("protocol.handle('booruimg'")
    expect(fetch).toContain('refererForBooruImage')
    expect(fetch).toContain('User-Agent')
  })
})

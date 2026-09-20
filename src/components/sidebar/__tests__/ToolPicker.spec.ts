import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TOOL_CATALOG } from '@/features/tools/tool-catalog'
import { useAppStore } from '@/stores/app'
import { useTaggerStore } from '@/stores/tagger'
import ToolPicker from '../ToolPicker.vue'

const EmptyRoute = { template: '<div></div>' }

function installApiMocks() {
  window.fsAPI = {
    readImageBase64: vi.fn(async (path: string) => ({
      success: true,
      base64: `BASE64:${path}`,
      mime: 'image/png',
    })),
  } as unknown as Window['fsAPI']
  window.galleryAPI = {
    getStats: vi.fn(async () => ({ success: true, data: { totalImages: 1284, totalRoots: 3, totalSize: 0 } })),
  } as unknown as Window['galleryAPI']
}

async function mountPicker() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: EmptyRoute }, ...TOOL_CATALOG.map((tool) => ({ path: tool.route, component: EmptyRoute }))],
  })
  await router.push('/')
  await router.isReady()

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(ToolPicker)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)
  app.mount(host)
  await nextTick()

  return { host, app, router, store: useAppStore(), tagger: useTaggerStore() }
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function settle() {
  await nextTick()
  await flushAsync()
  await nextTick()
}

describe('ToolPicker', () => {
  beforeEach(() => {
    localStorage.clear()
    installApiMocks()
  })

  it('lists every tool as a card with real numbers instead of placeholders', async () => {
    const { host, app, store, tagger } = await mountPicker()
    try {
      tagger.queue = [
        { id: 'a', path: 'a.png', status: 'pending' },
        { id: 'b', path: 'b.png', status: 'reviewed' },
      ] as never
      store.toolPickerOpen = true
      await settle()

      const cards = [...host.querySelectorAll<HTMLButtonElement>('.tool-card')]
      expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(TOOL_CATALOG.map((tool) => `进入${tool.label}`))
      expect(host.querySelector('.tool-card--gallery .tool-card__meta b')?.textContent).toBe('1,284')
      expect(host.querySelector('.tool-card--tagger .tool-card__meta b')?.textContent).toBe('1')
      expect(host.querySelector('.tool-card--training .tool-card__meta b')?.textContent).toBe('空闲')
      expect(host.textContent).not.toContain('E03')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('crossfades between two poster layers and enters a tool on click', async () => {
    const { host, app, store, router } = await mountPicker()
    try {
      store.toolPickerOpen = true
      await settle()

      expect(host.querySelectorAll('.tool-picker__poster')).toHaveLength(2)
      expect(host.querySelector('.tool-picker__poster.is-active')?.getAttribute('src')).toBe('/tools/gallery.jpg')

      host.querySelector<HTMLButtonElement>('.tool-card--tagger')!.dispatchEvent(new Event('mouseenter'))
      await settle()
      expect(host.querySelector('.tool-picker__poster.is-active')?.getAttribute('src')).toBe('/tools/tagger.jpg')
      expect(host.querySelector('.tool-picker__title h2')?.textContent).toBe('标注')

      host.querySelector<HTMLButtonElement>('.tool-card--tagger')!.click()
      await settle()
      expect(store.toolPickerOpen).toBe(false)
      expect(router.currentRoute.value.path).toBe('/tagger')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('filters tools from the search box and supports arrow keys + Enter', async () => {
    const { host, app, store, router } = await mountPicker()
    try {
      store.openToolPicker({ focusSearch: true })
      await settle()

      const input = host.querySelector<HTMLInputElement>('.tool-picker__search input')!
      input.value = '训练'
      input.dispatchEvent(new Event('input'))
      await settle()
      expect([...host.querySelectorAll('.tool-card')].map((card) => card.getAttribute('aria-label'))).toEqual(['进入训练'])
      expect(host.querySelector('.tool-card.active')?.classList.contains('tool-card--training')).toBe(true)

      input.value = ''
      input.dispatchEvent(new Event('input'))
      await settle()
      const dialog = host.querySelector<HTMLElement>('.tool-picker')!
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      await settle()
      expect(host.querySelector('.tool-card.active')?.classList.contains('tool-card--upscale')).toBe(true)
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await settle()
      expect(router.currentRoute.value.path).toBe('/upscale')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('shows the custom poster after it is changed in settings and falls back after reset', async () => {
    const { host, app, store } = await mountPicker()
    try {
      store.setToolPoster('gallery', 'C:/pics/new-background.png')
      await settle()
      store.toolPickerOpen = true
      await settle()

      expect(host.querySelector('.tool-picker__poster.is-active')?.getAttribute('src')).toContain('data:image/png;base64,BASE64:C:/pics/new-background.png')
      expect(host.querySelector('.tool-card--gallery .tool-card__art')?.getAttribute('src')).toContain('BASE64:C:/pics/new-background.png')

      store.setToolPoster('gallery', null)
      await settle()
      expect(host.querySelector('.tool-picker__poster.is-active')?.getAttribute('src')).toBe('/tools/gallery.jpg')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})

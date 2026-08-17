import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/stores/app'
import ToolPicker from '../ToolPicker.vue'

const EmptyRoute = { template: '<div></div>' }

function installFsMock() {
  window.fsAPI = {
    readImageBase64: vi.fn(async (path: string) => ({
      success: true,
      base64: `BASE64:${path}`,
      mime: 'image/png',
    })),
  } as unknown as Window['fsAPI']
}

async function mountPicker() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: EmptyRoute }],
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

  const store = useAppStore()
  return { host, app, store }
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('ToolPicker custom posters', () => {
  beforeEach(() => {
    localStorage.clear()
    installFsMock()
  })

  it('shows the custom poster after it is changed in settings', async () => {
    const { host, app, store } = await mountPicker()
    try {
      store.setToolPoster('gallery', 'C:/pics/new-background.png')
      await nextTick()
      await flushAsync()
      await nextTick()

      store.toolPickerOpen = true
      await nextTick()
      await flushAsync()
      await nextTick()

      const poster = host.querySelector<HTMLImageElement>('.tool-picker__poster--gallery')
      expect(poster).not.toBeNull()
      expect(poster!.src).toContain('data:image/png;base64,BASE64:C:/pics/new-background.png')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('falls back to the default poster after a custom one is reset', async () => {
    const { host, app, store } = await mountPicker()
    try {
      store.setToolPoster('gallery', 'C:/pics/old-background.png')
      await nextTick()
      await flushAsync()
      await nextTick()

      store.setToolPoster('gallery', null)
      await nextTick()
      await flushAsync()
      await nextTick()

      store.toolPickerOpen = true
      await nextTick()
      await flushAsync()
      await nextTick()

      const poster = host.querySelector<HTMLImageElement>('.tool-picker__poster--gallery')
      expect(poster).not.toBeNull()
      expect(poster!.src).toContain('/tools/gallery.jpg')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})

import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { APP_NAVIGATION } from '@/features/navigation/app-navigation'
import { useAppStore } from '@/stores/app'
import AppSidebar from '../AppSidebar.vue'

const EmptyRoute = { template: '<div></div>' }

describe('AppSidebar interaction', () => {
  it('renders the home entry and the tool picker toggle', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: EmptyRoute }],
    })
    await router.push('/')
    await router.isReady()

    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(AppSidebar)
    const pinia = createPinia()
    app.use(pinia)
    app.use(router)

    try {
      app.mount(host)
      await nextTick()

      expect(host.querySelectorAll('.nav-item')).toHaveLength(APP_NAVIGATION.length)
      expect(host.querySelector('.nav-item')?.getAttribute('aria-label')).toBe('主页')
      expect(host.querySelector('.nav-item.active')?.getAttribute('aria-current')).toBe('page')
      expect(host.querySelector('.tool-picker-toggle')).not.toBeNull()
      expect(host.querySelector('.tool-picker-toggle')?.getAttribute('aria-label')).toBe('工具选择')
      expect(host.querySelector('#tools-subnavigation')).toBeNull()
      expect(host.querySelector('.tool-subnav')).toBeNull()
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('toggles the tool picker through the store', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: EmptyRoute }],
    })
    await router.push('/')
    await router.isReady()

    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(AppSidebar)
    const pinia = createPinia()
    app.use(pinia)
    app.use(router)

    try {
      app.mount(host)
      await nextTick()

      const store = useAppStore()
      expect(store.toolPickerOpen).toBe(false)
      host.querySelector<HTMLButtonElement>('.tool-picker-toggle')!.click()
      await nextTick()
      expect(store.toolPickerOpen).toBe(true)
      expect(host.querySelector('.tool-picker-toggle')?.getAttribute('aria-expanded')).toBe('true')
    } finally {
      app.unmount()
      host.remove()
    }
  })
})

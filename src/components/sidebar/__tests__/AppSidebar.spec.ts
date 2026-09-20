import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/stores/app'
import AppSidebar from '../AppSidebar.vue'

const EmptyRoute = { template: '<div></div>' }

async function mountSidebar(initialRoute = '/') {
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: EmptyRoute },
      { path: '/gallery', component: EmptyRoute },
      { path: '/training/run', component: EmptyRoute },
      { path: '/console', component: EmptyRoute },
      { path: '/settings', component: EmptyRoute },
    ],
  })
  await router.push(initialRoute)
  await router.isReady()

  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(AppSidebar)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)
  app.mount(host)
  await nextTick()
  return { host, app, router, store: useAppStore() }
}

describe('AppSidebar (floating rail)', () => {
  beforeEach(() => localStorage.clear())

  it('renders home, the tool picker button and the utility entries; tools are not listed individually', async () => {
    const { host, app } = await mountSidebar('/')
    try {
      const labels = [...host.querySelectorAll<HTMLButtonElement>('button')].map((button) => button.getAttribute('aria-label'))
      expect(labels).toEqual(['首页', '工具选择', '控制台', '设置'])
      expect(host.querySelector('.nav-item.active')?.getAttribute('aria-current')).toBe('page')
      expect(host.querySelector('.nav-current')).toBeNull()
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('shows the current tool as a poster avatar and opens the picker from it', async () => {
    const { host, app, store } = await mountSidebar('/training/run')
    try {
      const avatar = host.querySelector<HTMLButtonElement>('.nav-current')
      expect(avatar).not.toBeNull()
      expect(avatar!.getAttribute('aria-label')).toBe('当前工具：训练')
      expect(avatar!.querySelector('img')?.getAttribute('src')).toBe('/tools/train.jpg')
      expect(avatar!.classList.contains('active')).toBe(true)

      avatar!.click()
      await nextTick()
      expect(store.toolPickerOpen).toBe(true)
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('lets the user jump back to the last workspace when not inside a tool', async () => {
    localStorage.setItem('baka-last-workspace-v1', '/gallery')
    const { host, app, router } = await mountSidebar('/settings')
    try {
      const avatar = host.querySelector<HTMLButtonElement>('.nav-current')
      expect(avatar?.getAttribute('aria-label')).toBe('回到图库')
      expect(avatar?.classList.contains('active')).toBe(false)
      avatar!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      await nextTick()
      expect(router.currentRoute.value.path).toBe('/gallery')
    } finally {
      app.unmount()
      host.remove()
    }
  })

  it('toggles the tool picker through the store', async () => {
    const { host, app, store } = await mountSidebar('/')
    try {
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

import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { APP_NAVIGATION } from '@/features/navigation/app-navigation'
import AppSidebar from '../AppSidebar.vue'

const EmptyRoute = { template: '<div></div>' }

describe('AppSidebar route interaction', () => {
  it('tracks settings, manual tools expansion, tool routes, and route-driven collapse', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: EmptyRoute },
        { path: '/reverse', component: EmptyRoute },
        { path: '/settings', component: EmptyRoute },
      ],
    })
    await router.push('/settings')
    await router.isReady()

    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp(AppSidebar)
    app.use(createPinia())
    app.use(router)

    try {
      app.mount(host)
      await nextTick()

      expect(host.querySelector('.sidebar-brand')).toBeNull()
      expect(host.querySelector('.brand-mark')).toBeNull()
      expect(host.querySelector('.brand-name')).toBeNull()
      expect(host.querySelectorAll('.nav-item')).toHaveLength(APP_NAVIGATION.length)
      expect(host.querySelector('.nav-item')?.getAttribute('aria-label')).toBe('主页')

      const toolsItem = APP_NAVIGATION.find((item) => item.id === 'tools')!
      const settingsItem = APP_NAVIGATION.find((item) => item.id === 'settings')!
      const sidebarNav = host.querySelector<HTMLElement>('.sidebar-nav')!
      const toolsButton = host.querySelector<HTMLButtonElement>(`[aria-label="${toolsItem.label}"]`)!

      expect(host.querySelector('.nav-item.active')?.getAttribute('aria-label')).toBe(settingsItem.label)
      expect(host.querySelector('.nav-item.active')?.getAttribute('aria-current')).toBe('page')
      expect(sidebarNav.style.getPropertyValue('--active-navigation-index')).toBe('5')
      expect(sidebarNav.style.getPropertyValue('--tool-subnav-row-height')).toBe('30px')
      expect(sidebarNav.style.getPropertyValue('--tool-subnav-gap')).toBe('2px')
      expect(sidebarNav.style.getPropertyValue('--tool-subnav-margin-top')).toBe('3px')
      expect(sidebarNav.style.getPropertyValue('--tool-subnav-margin-bottom')).toBe('2px')
      expect(sidebarNav.style.getPropertyValue('--tool-subnav-flow-offset')).toBe('131px')
      expect(host.querySelector('#tools-subnavigation')).toBeNull()

      toolsButton.click()
      await nextTick()

      expect(sidebarNav.classList.contains('tools-expanded')).toBe(true)
      expect(sidebarNav.classList.contains('active-after-tools')).toBe(true)
      expect(toolsButton.getAttribute('aria-expanded')).toBe('true')
      const reverseButton = [...host.querySelectorAll<HTMLButtonElement>('.tool-subnav-item')]
        .find((button) => button.textContent?.trim() === toolsItem.children?.find((child) => child.route === '/reverse')?.label)!
      reverseButton.focus()
      expect(document.activeElement).toBe(reverseButton)

      await router.push('/reverse')
      await nextTick()

      expect(host.querySelector('.nav-item.active')?.getAttribute('aria-label')).toBe(toolsItem.label)
      expect(host.querySelector('.nav-item.active')?.getAttribute('aria-current')).toBe('page')
      expect(sidebarNav.classList.contains('tools-expanded')).toBe(true)
      expect(sidebarNav.classList.contains('active-after-tools')).toBe(false)
      expect(host.querySelector('#tools-subnavigation')).not.toBeNull()
      expect(host.querySelector('.tool-subnav-item.active')?.getAttribute('aria-current')).toBe('page')

      await router.push('/settings')
      await nextTick()

      expect(host.querySelector('.nav-item.active')?.getAttribute('aria-label')).toBe(settingsItem.label)
      expect(host.querySelector('#tools-subnavigation')).toBeNull()
      expect(sidebarNav.classList.contains('tools-expanded')).toBe(false)
      expect(sidebarNav.classList.contains('active-after-tools')).toBe(false)
    } finally {
      app.unmount()
      host.remove()
    }
  })
})

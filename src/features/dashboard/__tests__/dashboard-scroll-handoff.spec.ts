import { createApp, type Ref, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calculateDashboardHandoffProgress,
  getDashboardHandoffDistance,
  useDashboardScrollHandoff,
} from '../dashboard-scroll-handoff'

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches })) as unknown as typeof window.matchMedia)
}

function mountHandoffHost(clientHeight = 900) {
  const scrollContainer = document.createElement('div')
  scrollContainer.className = 'main-content'
  Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: clientHeight })

  const host = document.createElement('div')
  scrollContainer.append(host)
  document.body.append(scrollContainer)

  let progress: Ref<number> | undefined
  const app = createApp({
    setup() {
      const pageElement = ref<HTMLElement | null>(null)
      progress = useDashboardScrollHandoff(pageElement)
      return { pageElement }
    },
    template: '<div ref="pageElement"></div>',
  })
  app.mount(host)

  return {
    app,
    progress: progress!,
    scrollContainer,
    cleanup() {
      app.unmount()
      scrollContainer.remove()
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('dashboard scroll handoff calculations', () => {
  it('clamps progress below, within, and above the handoff distance', () => {
    expect(calculateDashboardHandoffProgress(-20, 280)).toBe(0)
    expect(calculateDashboardHandoffProgress(140, 280)).toBe(0.5)
    expect(calculateDashboardHandoffProgress(400, 280)).toBe(1)
  })

  it('uses a shorter handoff distance for short viewports', () => {
    expect(getDashboardHandoffDistance(720)).toBe(220)
    expect(getDashboardHandoffDistance(721)).toBe(280)
  })

  it('returns zero for invalid progress inputs', () => {
    expect(calculateDashboardHandoffProgress(100, 0)).toBe(0)
    expect(calculateDashboardHandoffProgress(100, -1)).toBe(0)
    expect(calculateDashboardHandoffProgress(Number.NaN, 280)).toBe(0)
    expect(calculateDashboardHandoffProgress(100, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('useDashboardScrollHandoff', () => {
  it('coalesces scroll events into one animation frame and updates progress', () => {
    stubReducedMotion(false)
    let scheduledFrame: FrameRequestCallback | undefined
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 7
    })
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const mounted = mountHandoffHost()
    mounted.scrollContainer.scrollTop = 140
    mounted.scrollContainer.dispatchEvent(new Event('scroll'))
    mounted.scrollContainer.dispatchEvent(new Event('scroll'))

    expect(requestFrame).toHaveBeenCalledTimes(1)
    scheduledFrame!(0)
    expect(mounted.progress.value).toBe(0.5)

    mounted.cleanup()
  })

  it('removes the scroll listener when unmounted', () => {
    stubReducedMotion(false)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 9))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const mounted = mountHandoffHost()
    const removeEventListener = vi.spyOn(mounted.scrollContainer, 'removeEventListener')

    mounted.app.unmount()

    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))
    mounted.scrollContainer.remove()
  })

  it('keeps progress at zero when reduced motion is preferred', () => {
    stubReducedMotion(true)
    let scheduledFrame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 11
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const mounted = mountHandoffHost()
    mounted.scrollContainer.scrollTop = 280
    mounted.scrollContainer.dispatchEvent(new Event('scroll'))
    scheduledFrame!(0)

    expect(mounted.progress.value).toBe(0)

    mounted.cleanup()
  })
})

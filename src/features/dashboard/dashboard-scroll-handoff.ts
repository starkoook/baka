import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function getDashboardHandoffDistance(viewportHeight: number): number {
  return viewportHeight <= 720 ? 220 : 280
}

export function calculateDashboardHandoffProgress(scrollTop: number, distance: number): number {
  if (!Number.isFinite(scrollTop) || !Number.isFinite(distance) || distance <= 0) return 0

  return Math.min(1, Math.max(0, scrollTop / distance))
}

export function useDashboardScrollHandoff(pageElement: Ref<HTMLElement | null>): Ref<number> {
  const progress = ref(0)
  let scrollContainer: HTMLElement | null = null
  let frameId: number | null = null

  const update = () => {
    frameId = null

    if (!scrollContainer || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      progress.value = 0
      return
    }

    const distance = getDashboardHandoffDistance(scrollContainer.clientHeight)
    progress.value = calculateDashboardHandoffProgress(scrollContainer.scrollTop, distance)
  }

  const handleScroll = () => {
    if (frameId !== null) return
    frameId = requestAnimationFrame(update)
  }

  onMounted(() => {
    scrollContainer = pageElement.value?.closest<HTMLElement>('.main-content') ?? null
    if (!scrollContainer) return

    scrollContainer.scrollTop = 0
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    update()
  })

  onBeforeUnmount(() => {
    scrollContainer?.removeEventListener('scroll', handleScroll)
    if (frameId !== null) cancelAnimationFrame(frameId)

    frameId = null
    scrollContainer = null
  })

  return progress
}

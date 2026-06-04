import { playClick, playHover } from './useSound'

// Global click sound directive + hover effect
export function setupInteractions() {
  // Click sound on any clickable element
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const clickable = target.closest('button, a, .clickable, [role="button"], .card, .nav-item, .toggle-btn')
    if (clickable) {
      playClick()
    }
  })

  // Subtle hover sound on cards and nav items
  document.addEventListener('mouseenter', (e) => {
    const target = e.target as HTMLElement
    const hoverable = target.closest('.card, .nav-item, .btn-primary')
    if (hoverable) {
      playHover()
    }
  }, true)
}

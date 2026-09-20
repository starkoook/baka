import { playClick, playHover } from './useSound'

// Global click sound directive + hover effect
export function setupInteractions() {
  // Click sound on any clickable element
  document.addEventListener('click', (e) => {
    const target = e.target
    if (!(target instanceof Element)) return
    const clickable = target.closest('button, a, .clickable, [role="button"], .card, .nav-item, .toggle-btn')
    // data-no-click-sound：设置页试听按钮自己播指定那句，不要再叠一句随机的
    if (clickable && !clickable.closest('[data-no-click-sound]')) playClick()
  })

  // Subtle hover sound on cards and nav items
  document.addEventListener('mouseenter', (e) => {
    const target = e.target
    if (!(target instanceof Element)) return
    const hoverable = target.closest('.card, .nav-item, .btn-primary')
    if (hoverable) playHover()
  }, true)
}

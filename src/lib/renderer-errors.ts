/** Chrome reports these when a ResizeObserver callback itself causes another layout. */
export function isBenignRendererError(message: string): boolean {
  return message.includes('ResizeObserver loop')
}

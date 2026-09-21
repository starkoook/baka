export function distanceOutsideViewport(
  rect: { top: number; bottom: number },
  root: { top: number; bottom: number },
): number {
  if (rect.bottom < root.top) return root.top - rect.bottom
  if (rect.top > root.bottom) return rect.top - root.bottom
  return 0
}

export function shouldReleaseThumb(
  isIntersecting: boolean,
  distanceFromViewport: number,
  releaseAfterPx: number,
): boolean {
  return !isIntersecting && distanceFromViewport > releaseAfterPx
}

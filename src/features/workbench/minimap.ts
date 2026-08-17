export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

export interface Rect extends Point {
  width: number
  height: number
}

export interface MinimapTransform {
  x0: number
  y0: number
  scale: number
  ox: number
  oy: number
}

export function visibleWorldRect(pan: Point, zoom: number, viewport: Size): Rect {
  return {
    x: -pan.x / zoom,
    y: -pan.y / zoom,
    width: viewport.w / zoom,
    height: viewport.h / zoom,
  }
}

export function createMinimapTransform(
  nodes: Rect[],
  viewport: Rect,
  minimap: Size,
  padding = 40,
): MinimapTransform {
  let x0 = viewport.x
  let y0 = viewport.y
  let x1 = viewport.x + viewport.width
  let y1 = viewport.y + viewport.height

  for (const node of nodes) {
    x0 = Math.min(x0, node.x)
    y0 = Math.min(y0, node.y)
    x1 = Math.max(x1, node.x + node.width)
    y1 = Math.max(y1, node.y + node.height)
  }

  x0 -= padding
  y0 -= padding
  x1 += padding
  y1 += padding
  const width = Math.max(1, x1 - x0)
  const height = Math.max(1, y1 - y0)
  const scale = Math.min(minimap.w / width, minimap.h / height)

  return {
    x0,
    y0,
    scale,
    ox: (minimap.w - width * scale) / 2,
    oy: (minimap.h - height * scale) / 2,
  }
}

export function worldToMinimap(point: Point, transform: MinimapTransform): Point {
  return {
    x: transform.ox + (point.x - transform.x0) * transform.scale,
    y: transform.oy + (point.y - transform.y0) * transform.scale,
  }
}

export function minimapToWorld(point: Point, transform: MinimapTransform): Point {
  return {
    x: transform.x0 + (point.x - transform.ox) / transform.scale,
    y: transform.y0 + (point.y - transform.oy) / transform.scale,
  }
}

export function minimapViewportRect(viewport: Rect, transform: MinimapTransform): Rect {
  const topLeft = worldToMinimap(viewport, transform)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: viewport.width * transform.scale,
    height: viewport.height * transform.scale,
  }
}

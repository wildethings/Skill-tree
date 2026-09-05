import type { Bounds } from '../lib/graph/layout'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2.2

/**
 * Pan and zoom for the unbounded canvas. The transform is written straight to
 * the layers rather than held in React state, so a pan gesture costs one style
 * write per frame; subscribers (the minimap) are notified separately.
 */
export class Viewport {
  x = 0
  y = 0
  k = 1
  private layers: Array<HTMLElement | SVGElement> = []
  private listeners = new Set<() => void>()

  attach(layers: Array<HTMLElement | SVGElement | null>) {
    this.layers = layers.filter((l): l is HTMLElement | SVGElement => Boolean(l))
    this.apply()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  set(x: number, y: number, k = this.k) {
    this.x = x
    this.y = y
    this.k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))
    this.apply()
  }

  panBy(dx: number, dy: number) {
    this.set(this.x + dx, this.y + dy)
  }

  /** Zoom about a point in screen coordinates, so the point stays put. */
  zoomAt(screenX: number, screenY: number, factor: number) {
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.k * factor))
    const scale = k / this.k
    this.set(screenX - (screenX - this.x) * scale, screenY - (screenY - this.y) * scale, k)
  }

  toGraph(screenX: number, screenY: number) {
    return { x: (screenX - this.x) / this.k, y: (screenY - this.y) / this.k }
  }

  /**
   * Frame `bounds` inside `size`.
   *
   * `min` is a legibility floor, not the zoom limit: on a phone, fitting eight
   * roots would shrink a node past reading size, so the graph is allowed to
   * overflow and be panned instead.
   */
  fit(
    bounds: Bounds,
    size: { width: number; height: number },
    { padding = 72, min = 0.45, max = MAX_ZOOM }: { padding?: number; min?: number; max?: number } = {},
  ) {
    const w = Math.max(1, bounds.maxX - bounds.minX)
    const h = Math.max(1, bounds.maxY - bounds.minY)
    const pad = Math.min(padding, Math.min(size.width, size.height) / 5)
    const raw = Math.min((size.width - pad * 2) / w, (size.height - pad * 2) / h)
    const k = Math.min(max, Math.max(min, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw))))

    // Horizontally: centre what fits, anchor to the first root what does not.
    // Landing in the middle of an orchard that overflows is worse than landing
    // on its first root and panning from there.
    const x = w * k <= size.width - pad * 2 ? size.width / 2 - ((bounds.minX + bounds.maxX) / 2) * k : pad - bounds.minX * k

    // Vertically: always hang from the top, because that is the composition —
    // roots in a row along the top, everything growing downward from them.
    this.set(x, pad - bounds.minY * k, k)
  }

  /** Centre a rectangle of graph space without changing zoom. */
  centreOn(bounds: Bounds, size: { width: number; height: number }) {
    this.set(
      size.width / 2 - ((bounds.minX + bounds.maxX) / 2) * this.k,
      size.height / 2 - ((bounds.minY + bounds.maxY) / 2) * this.k,
    )
  }

  private apply() {
    const transform = `translate3d(${this.x.toFixed(2)}px, ${this.y.toFixed(2)}px, 0) scale(${this.k.toFixed(4)})`
    for (const layer of this.layers) layer.style.transform = transform
    for (const fn of this.listeners) fn()
  }
}

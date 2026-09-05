import { useEffect, useRef } from 'react'
import type { NodeTint } from '../lib/color/tint'
import { NODE_H, NODE_W, type Layout } from '../lib/graph/layout'
import { hex } from '../lib/color/oklch'
import type { Viewport } from './viewport'

const W = 168
const H = 108
const PAD = 8

/**
 * The whole graph at a glance with the current viewport marked. Drawn to a
 * canvas and updated by direct subscription, so panning does not re-render React.
 */
export function Minimap({
  viewport,
  layout,
  tints,
  host,
}: {
  viewport: Viewport
  layout: Layout
  tints: Record<string, NodeTint>
  host: React.RefObject<HTMLElement>
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)

  const scaleOf = () => {
    const { minX, minY, maxX, maxY } = layout.bounds
    const k = Math.min((W - PAD * 2) / Math.max(1, maxX - minX), (H - PAD * 2) / Math.max(1, maxY - minY))
    return { k, minX, minY, w: (maxX - minX) * k, h: (maxY - minY) * k }
  }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const { k, minX, minY, w, h } = scaleOf()
    const ox = (W - w) / 2
    const oy = (H - h) / 2
    for (const [id, p] of Object.entries(layout.pos)) {
      const tint = tints[id]
      ctx.fillStyle = tint ? hex(tint.lch) : '#999'
      const x = ox + (p.x - minX) * k
      const y = oy + (p.y - minY) * k
      const bw = Math.max(2.5, NODE_W * k)
      const bh = Math.max(2, NODE_H * k)
      ctx.beginPath()
      ctx.roundRect(x, y, bw, bh, Math.min(2, bw / 3))
      ctx.fill()
    }
  }, [layout, tints])

  useEffect(() => {
    const update = () => {
      const el = frame.current
      const view = host.current
      if (!el || !view) return
      const rect = view.getBoundingClientRect()
      const { k, minX, minY, w, h } = scaleOf()
      const ox = (W - w) / 2
      const oy = (H - h) / 2
      const gx = -viewport.x / viewport.k
      const gy = -viewport.y / viewport.k
      el.style.left = `${ox + (gx - minX) * k}px`
      el.style.top = `${oy + (gy - minY) * k}px`
      el.style.width = `${(rect.width / viewport.k) * k}px`
      el.style.height = `${(rect.height / viewport.k) * k}px`
    }
    update()
    return viewport.subscribe(update)
  }, [viewport, layout, host])

  const jumpTo = (e: React.PointerEvent) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const { k, minX, minY, w, h } = scaleOf()
    const graphX = (e.clientX - rect.left - (W - w) / 2) / k + minX
    const graphY = (e.clientY - rect.top - (H - h) / 2) / k + minY
    const view = host.current?.getBoundingClientRect()
    if (!view) return
    viewport.set(view.width / 2 - graphX * viewport.k, view.height / 2 - graphY * viewport.k)
  }

  if (Object.keys(layout.pos).length === 0) return null

  return (
    <div className="minimap canvas-overlay" onPointerDown={jumpTo} aria-label="Minimap">
      <canvas ref={ref} style={{ width: W, height: H }} />
      <div className="minimap-frame" ref={frame} />
    </div>
  )
}

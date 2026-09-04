import { NODE_H, NODE_W, type Pos } from '../lib/graph/layout'
import { LAYOUT_SPRING, PUSH_SPRING, SCALE_SPRING, prefersReducedMotion, step, type Axis } from '../lib/motion/spring'

/* ------------------------------------------------------------- cursor push -- */
const PUSH_RADIUS = 120
const MAX_PUSH = 24
/** Cursor speed (px/s) that produces the full displacement. */
const FULL_SPEED = 900

export type EdgeSpec = { key: string; from: string; to: string; kind: 'primary' | 'cross' }

type Motion = {
  x: Axis
  y: Axis
  /** Cursor-push offset. A separate layer from the layout position, always
   *  springing back to zero, and never persisted anywhere. */
  px: Axis
  py: Axis
  scale: Axis
  tx: number
  ty: number
  targetScale: number
  /** Roots barely move, leaves swing furthest — this is what reads as vines. */
  weight: number
  el: HTMLElement | null
  exiting: boolean
}

export type EngineHost = {
  /** Path between two node centres, so the engine stays geometry-agnostic. */
  path: (from: Pos, to: Pos) => string
  onExitDone: (ids: string[]) => void
}

/**
 * Owns every per-frame write on the canvas: node transforms and edge geometry,
 * driven from one requestAnimationFrame loop straight to the DOM. Nothing here
 * routes through React state, and nothing here is ever persisted.
 */
export class CanvasEngine {
  private nodes = new Map<string, Motion>()
  /** Kept apart from `nodes` because ref callbacks fire before setTargets. */
  private elements = new Map<string, HTMLElement>()
  private edges: Array<EdgeSpec & { el: SVGPathElement }> = []
  private raf = 0
  private last = 0
  private running = false

  /** Cursor in graph coordinates, plus the velocity derived between frames. */
  private cursor: { x: number; y: number; vx: number; vy: number; active: boolean } = {
    x: 0, y: 0, vx: 0, vy: 0, active: false,
  }
  private lastCursor: { x: number; y: number; t: number } | null = null
  private pushEnabled = true
  private reduced = prefersReducedMotion()

  constructor(private host: EngineHost) {}

  /* --------------------------------------------------------- registration -- */

  registerNode(id: string, el: HTMLElement | null) {
    if (el) this.elements.set(id, el)
    else this.elements.delete(id)
    const m = this.nodes.get(id)
    if (m) m.el = el
    if (el) this.writeNode(id)
  }

  registerEdge(spec: EdgeSpec, el: SVGPathElement | null) {
    this.edges = this.edges.filter((e) => e.key !== spec.key)
    if (el) this.edges.push({ ...spec, el })
    this.kick()
  }

  clearEdges() {
    this.edges = []
  }

  /**
   * New laid-out positions. Nodes spring toward their *current* target, so a
   * layout that recomputes mid-interaction settles into the new position rather
   * than the stale one.
   */
  setTargets(pos: Record<string, Pos>, weights: Record<string, number>, animate: boolean) {
    for (const [id, p] of Object.entries(pos)) {
      const existing = this.nodes.get(id)
      if (!existing) {
        // Node birth: springs up from 0.8 at its laid-out position.
        this.nodes.set(id, {
          x: { value: p.x, velocity: 0 },
          y: { value: p.y, velocity: 0 },
          px: { value: 0, velocity: 0 },
          py: { value: 0, velocity: 0 },
          scale: { value: animate && !this.reduced ? 0.8 : 1, velocity: 0 },
          tx: p.x,
          ty: p.y,
          targetScale: 1,
          weight: weights[id] ?? 1,
          el: this.elements.get(id) ?? null,
          exiting: false,
        })
      } else {
        existing.tx = p.x
        existing.ty = p.y
        existing.targetScale = 1
        existing.exiting = false
        existing.weight = weights[id] ?? 1
        existing.el = this.elements.get(id) ?? existing.el
        if (this.reduced || !animate) {
          existing.x.value = p.x
          existing.y.value = p.y
          existing.x.velocity = 0
          existing.y.velocity = 0
          existing.scale.value = 1
        }
      }
    }
    for (const id of [...this.nodes.keys()]) {
      if (!(id in pos) && !this.nodes.get(id)!.exiting) this.nodes.delete(id)
    }
    this.kick()
  }

  /** Children of a collapsing root fall toward it and fade, then unmount. */
  collapseInto(ids: string[], target: Pos) {
    if (this.reduced) return this.host.onExitDone(ids)
    for (const id of ids) {
      const m = this.nodes.get(id)
      if (!m) continue
      m.tx = target.x
      m.ty = target.y
      m.targetScale = 0
      m.exiting = true
    }
    this.kick()
    window.setTimeout(() => {
      for (const id of ids) this.nodes.delete(id)
      this.host.onExitDone(ids)
    }, 320)
  }

  positionOf(id: string): Pos | null {
    const m = this.nodes.get(id)
    return m ? { x: m.x.value, y: m.y.value } : null
  }

  /* ---------------------------------------------------------------- input -- */

  setCursor(x: number, y: number) {
    if (!this.pushEnabled || this.reduced) return
    const t = performance.now()
    if (this.lastCursor) {
      const dt = Math.max(8, t - this.lastCursor.t) / 1000
      this.cursor.vx = (x - this.lastCursor.x) / dt
      this.cursor.vy = (y - this.lastCursor.y) / dt
    }
    this.cursor.x = x
    this.cursor.y = y
    this.cursor.active = true
    this.lastCursor = { x, y, t }
    this.kick()
  }

  /**
   * Stand the push down. Every caller that can strand a node — pointer leaving
   * the window, the tab going away, a pan or drag starting, a card opening —
   * comes through here, and the displacement springs back to zero rather than
   * freezing wherever it was.
   */
  releaseCursor() {
    this.cursor.active = false
    this.cursor.vx = 0
    this.cursor.vy = 0
    this.lastCursor = null
    this.kick()
  }

  suspendPush(suspended: boolean) {
    this.pushEnabled = !suspended
    if (suspended) this.releaseCursor()
  }

  setReducedMotion(reduced: boolean) {
    this.reduced = reduced
    if (reduced) this.releaseCursor()
  }

  /* ----------------------------------------------------------------- loop -- */

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private kick() {
    if (this.running) return
    this.start()
  }

  private frame = () => {
    const t = performance.now()
    const dt = Math.min((t - this.last) / 1000, 1 / 30)
    this.last = t

    // The cursor's own velocity decays, so a flick pushes once and lets go.
    if (this.cursor.active) {
      const decay = Math.exp(-dt * 9)
      this.cursor.vx *= decay
      this.cursor.vy *= decay
      if (Math.hypot(this.cursor.vx, this.cursor.vy) < 12) {
        this.cursor.vx = 0
        this.cursor.vy = 0
      }
    }

    let settled = true
    for (const [id, m] of this.nodes) {
      const atX = step(m.x, m.tx, LAYOUT_SPRING, dt)
      const atY = step(m.y, m.ty, LAYOUT_SPRING, dt)
      const atS = step(m.scale, m.targetScale, SCALE_SPRING, dt)

      const [dx, dy] = this.desiredPush(m)
      const atPX = step(m.px, dx, PUSH_SPRING, dt)
      const atPY = step(m.py, dy, PUSH_SPRING, dt)

      if (!(atX && atY && atS && atPX && atPY && dx === 0 && dy === 0)) settled = false
      this.writeNode(id)
    }

    // Edges repaint from displaced positions every frame — nodes that move
    // while their edges stay put would destroy the effect entirely.
    for (const edge of this.edges) {
      const a = this.nodes.get(edge.from)
      const b = this.nodes.get(edge.to)
      if (!a || !b) continue
      edge.el.setAttribute(
        'd',
        this.host.path(
          { x: a.x.value + a.px.value + NODE_W / 2, y: a.y.value + a.py.value + NODE_H / 2 },
          { x: b.x.value + b.px.value + NODE_W / 2, y: b.y.value + b.py.value + NODE_H / 2 },
        ),
      )
    }

    if (settled && !this.cursor.active) {
      this.running = false
      return
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  /**
   * Displacement the cursor is asking of this node right now: along its
   * direction of travel, scaled by speed, falling off with distance, and
   * weighted by depth. The spring targets this value, so when the cursor moves
   * on it becomes zero and the node springs home — there is no state in which a
   * node is left pushed aside.
   */
  private desiredPush(m: Motion): [number, number] {
    if (!this.cursor.active || !this.pushEnabled || this.reduced) return [0, 0]
    const speed = Math.hypot(this.cursor.vx, this.cursor.vy)
    if (speed < 1) return [0, 0]

    const cx = m.x.value + NODE_W / 2
    const cy = m.y.value + NODE_H / 2
    const dist = Math.hypot(cx - this.cursor.x, cy - this.cursor.y)
    if (dist > PUSH_RADIUS) return [0, 0]

    const t = 1 - dist / PUSH_RADIUS
    const falloff = t * t * (3 - 2 * t) // smoothstep
    const magnitude = Math.min(speed / FULL_SPEED, 1) * MAX_PUSH * falloff * m.weight
    return [(this.cursor.vx / speed) * magnitude, (this.cursor.vy / speed) * magnitude]
  }

  private writeNode(id: string) {
    const m = this.nodes.get(id)
    if (!m?.el) return
    const x = m.x.value + m.px.value
    const y = m.y.value + m.py.value
    m.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${m.scale.value.toFixed(3)})`
    if (m.exiting) m.el.style.opacity = String(Math.max(0, m.scale.value))
  }
}

/** Roots barely move; leaves swing furthest. */
export const pushWeight = (depth: number, isLeaf: boolean): number =>
  Math.min(1, 0.16 + depth * 0.3) * (isLeaf ? 1 : 0.85)

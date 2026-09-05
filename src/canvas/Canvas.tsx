import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useData } from '../data/store'
import { useUI } from '../ui/uiStore'
import { useReducedMotion, useTheme } from '../ui/useTheme'
import { milestonesOf } from '../lib/graph/graph'
import { NODE_H, NODE_W, boundsOf, edgePath, layoutGraph, offsetForDrop, type Pos } from '../lib/graph/layout'
import { crossTint, edgeTint, tintMap } from '../lib/color/tint'
import { css } from '../lib/color/oklch'
import { CanvasEngine, pushWeight, type EdgeSpec } from './engine'
import { Viewport } from './viewport'
import { NodeCard } from './NodeCard'
import { Minimap } from './Minimap'
import { Icon } from '../ui/Icon'

const LONG_PRESS_MS = 450
const DRAG_THRESHOLD = 4

export function Canvas() {
  const graph = useData((s) => s.graph)
  const index = useData((s) => s.index)
  const nudgeNode = useData((s) => s.nudgeNode)
  const toggleCollapse = useData((s) => s.toggleCollapse)
  const addCrossLink = useData((s) => s.addCrossLink)
  const reparent = useData((s) => s.reparent)

  const ui = useUI()
  const theme = useTheme()
  const reduced = useReducedMotion()

  const hostRef = useRef<HTMLDivElement>(null)
  const edgeLayer = useRef<SVGGElement>(null)
  const nodeLayer = useRef<HTMLDivElement>(null)
  const viewport = useRef(new Viewport()).current

  const [exiting, setExiting] = useState<string[]>([])
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null)

  const collapsed = graph.prefs.collapsedRootIds
  const layout = useMemo(() => layoutGraph(index, collapsed), [index, collapsed])
  const tints = useMemo(() => tintMap(index, theme), [index, theme])

  const engine = useRef<CanvasEngine | null>(null)
  if (!engine.current) {
    engine.current = new CanvasEngine({
      path: edgePath,
      onExitDone: (ids) => setExiting((e) => e.filter((id) => !ids.includes(id))),
    })
  }
  const eng = engine.current

  /* ------------------------------------------------------------- edges -- */

  const edges = useMemo<EdgeSpec[]>(() => {
    const out: EdgeSpec[] = []
    const visible = (id: string) => layout.standInFor[id] ?? id
    for (const node of index.live) {
      for (const parentId of node.parentIds) {
        if (!index.byId[parentId]) continue
        const from = visible(parentId)
        const to = visible(node.id)
        // A cross-link into a collapsed root still draws, terminating on the
        // collapsed root itself, so an interdisciplinary link is never invisible.
        if (from === to) continue
        out.push({
          key: `${parentId}->${node.id}`,
          from,
          to,
          kind: parentId === node.primaryParentId ? 'primary' : 'cross',
        })
      }
    }
    return out
  }, [index, layout])

  /**
   * A primary edge is drawn in the child's tint. A cross-link is drawn in the
   * tint of the parent it comes from, read at the child's depth — the same
   * colour as that parent's stop in the child's gradient.
   */
  const edgeColor = useCallback(
    (spec: EdgeSpec) => {
      if (spec.kind === 'primary') return tints[spec.to] ? css(edgeTint(tints[spec.to].lch, theme)) : 'var(--line)'
      return css(edgeTint(crossTint(index, spec.to, spec.from, theme), theme))
    },
    [tints, index, theme],
  )

  /* ------------------------------------------------------------ layout -- */

  const weights = useMemo(() => {
    const out: Record<string, number> = {}
    for (const node of index.live) {
      out[node.id] = pushWeight(index.depth[node.id] ?? 0, (index.childrenOf[node.id]?.length ?? 0) === 0)
    }
    return out
  }, [index])

  const prevPos = useRef<Record<string, Pos>>({})
  const firstFit = useRef(false)
  const seenEdges = useRef(new Set<string>())
  const drawnOnce = useRef(false)

  useLayoutEffect(() => {
    viewport.attach([edgeLayer.current, nodeLayer.current])
  }, [viewport])

  useLayoutEffect(() => {
    const collapsing = Object.keys(prevPos.current).filter((id) => !layout.pos[id] && layout.hidden.has(id))
    const targets = { ...layout.pos }
    for (const id of collapsing) {
      const stand = layout.standInFor[id]
      if (layout.pos[stand]) targets[id] = layout.pos[stand]
    }
    eng.setTargets(targets, weights, prevPos.current !== undefined && Object.keys(prevPos.current).length > 0)

    if (collapsing.length) {
      setExiting((e) => [...new Set([...e, ...collapsing])])
      const stand = layout.standInFor[collapsing[0]]
      if (layout.pos[stand]) eng.collapseInto(collapsing, layout.pos[stand])
    }
    prevPos.current = layout.pos

    // A new edge draws itself in from parent to child. Done here rather than in
    // render so it fires once per commit, and only after the first paint — the
    // whole graph animating in on load is not what this is for.
    const edgeKeys = new Set(edges.map((e) => e.key))
    if (drawnOnce.current) {
      for (const key of edgeKeys) {
        if (seenEdges.current.has(key)) continue
        const el = edgeLayer.current?.querySelector<SVGPathElement>(`[data-key="${CSS.escape(key)}"]`)
        if (!el) continue
        el.classList.add('edge-draw')
        el.addEventListener('animationend', () => el.classList.remove('edge-draw'), { once: true })
      }
    }
    seenEdges.current = edgeKeys
    drawnOnce.current = true

    if (!firstFit.current && index.live.length > 0 && hostRef.current) {
      firstFit.current = true
      const rect = hostRef.current.getBoundingClientRect()
      viewport.fit(layout.bounds, { width: rect.width, height: rect.height })
    }
    eng.start()
  }, [layout, weights, edges, eng, viewport, index.live.length])

  useEffect(() => {
    eng.setReducedMotion(reduced)
  }, [eng, reduced])

  useEffect(() => () => eng.stop(), [eng])

  /* ---------------------------------------------- focus mode and search -- */

  useEffect(() => {
    if (!ui.focusRootId || !hostRef.current) return
    const ids = Object.keys(layout.pos).filter((id) => index.rootIdOf[id] === ui.focusRootId)
    if (ids.length === 0) return
    const rect = hostRef.current.getBoundingClientRect()
    const subset: Record<string, Pos> = {}
    for (const id of ids) subset[id] = layout.pos[id]
    viewport.fit(boundsOf(subset), { width: rect.width, height: rect.height }, { padding: 48, min: 0.5, max: 1.1 })
  }, [ui.focusRootId, layout, index, viewport])

  useEffect(() => {
    const target = ui.highlightIds[0]
    if (!target || !layout.pos[target] || !hostRef.current) return
    const rect = hostRef.current.getBoundingClientRect()
    viewport.centreOn(
      { minX: layout.pos[target].x, minY: layout.pos[target].y, maxX: layout.pos[target].x + NODE_W, maxY: layout.pos[target].y + NODE_H },
      { width: rect.width, height: rect.height },
    )
  }, [ui.highlightIds, layout, viewport])

  /* Suspend the push whenever something else owns the pointer. */
  const detailOpen = ui.selectedId !== null || ui.adding !== null || ui.settingsOpen || ui.searchOpen
  useEffect(() => {
    eng.suspendPush(detailOpen || menu !== null || drag !== null)
  }, [eng, detailOpen, menu, drag])

  /* ---------------------------------------------------------- pointers -- */

  const gesture = useRef<
    | { kind: 'idle' }
    | { kind: 'pan'; lastX: number; lastY: number; moved: boolean }
    | { kind: 'press'; id: string; startX: number; startY: number; timer: number; moved: boolean }
    | { kind: 'drag'; id: string; grabX: number; grabY: number; moved: boolean }
  >({ kind: 'idle' })

  const pinch = useRef<{ distance: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  const nodeIdAt = (target: EventTarget | null): string | null =>
    (target as HTMLElement | null)?.closest?.('.node')?.getAttribute('data-id') ?? null

  const onPointerDown = (e: React.PointerEvent) => {
    // A secondary button is opening the context menu, not starting a gesture.
    if (e.button > 0) return
    // Chrome layered over the canvas owns its own pointers. This guard matters
    // even for the portalled menu: React propagates events through the React
    // tree, not the DOM tree, so a portal still reaches this handler — and
    // taking pointer capture here would swallow the click.
    if ((e.target as HTMLElement).closest('.canvas-overlay')) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) }
      gesture.current = { kind: 'idle' }
      return
    }

    const id = nodeIdAt(e.target)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    eng.releaseCursor()

    if (id) {
      const timer = window.setTimeout(() => {
        if (gesture.current.kind === 'press' && !gesture.current.moved) {
          gesture.current = { kind: 'idle' }
          setMenu({ id, x: e.clientX, y: e.clientY })
        }
      }, LONG_PRESS_MS)
      gesture.current = { kind: 'press', id, startX: e.clientX, startY: e.clientY, timer, moved: false }
    } else {
      gesture.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY, moved: false }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      const rect = hostRef.current!.getBoundingClientRect()
      viewport.zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, distance / pinch.current.distance)
      pinch.current.distance = distance
      return
    }

    const g = gesture.current
    if (g.kind === 'pan') {
      viewport.panBy(e.clientX - g.lastX, e.clientY - g.lastY)
      gesture.current = { ...g, lastX: e.clientX, lastY: e.clientY, moved: true }
      return
    }

    if (g.kind === 'press') {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD) {
        clearTimeout(g.timer)
        const pos = layout.pos[g.id]
        const at = graphPoint(e)
        gesture.current = { kind: 'drag', id: g.id, grabX: at.x - pos.x, grabY: at.y - pos.y, moved: true }
        setDrag({ id: g.id, over: null })
      }
      return
    }

    if (g.kind === 'drag') {
      const at = graphPoint(e)
      eng.dragTo(g.id, { x: at.x - g.grabX, y: at.y - g.grabY })
      const over = dropTargetAt(e, g.id)
      setDrag((d) => (d && d.over === over ? d : { id: g.id, over }))
      return
    }

    // Nothing else owns the pointer, so this is the cursor push.
    if (e.pointerType === 'mouse') {
      const at = graphPoint(e)
      eng.setCursor(at.x, at.y)
    }
  }

  const graphPoint = (e: { clientX: number; clientY: number }) => {
    const rect = hostRef.current!.getBoundingClientRect()
    return viewport.toGraph(e.clientX - rect.left, e.clientY - rect.top)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const g = gesture.current
    gesture.current = { kind: 'idle' }

    if (g.kind === 'press') {
      clearTimeout(g.timer)
      if (!g.moved) onTapNode(g.id)
      return
    }
    if (g.kind === 'drag') {
      const at = graphPoint(e)
      const dropped = { x: at.x - g.grabX, y: at.y - g.grabY }
      setDrag(null)
      eng.endDrag()
      const node = graph.nodes[g.id]
      const target = dropTargetAt(e, g.id)
      if (target) {
        const error = reparent(g.id, target)
        if (error) ui.showToast(error)
      } else if (node) {
        // A drag records an offset from the tidy position — never an absolute one.
        nudgeNode(g.id, offsetForDrop(node, layout.pos[g.id], dropped))
      }
      return
    }
    if (g.kind === 'pan' && !g.moved) {
      // Tapping empty canvas leaves focus mode.
      if (ui.focusRootId) ui.focusRoot(null)
      if (ui.linkingFrom) ui.startLink(null)
      if (ui.highlightIds.length) ui.highlight([])
    }
  }

  /**
   * Dropping one node onto another re-parents it. The dragged card sits under
   * the pointer, so it carries `pointer-events: none` while dragging —
   * otherwise it is the only thing hit-testing ever finds.
   */
  const dropTargetAt = (e: { clientX: number; clientY: number }, draggingId: string): string | null => {
    const id = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.node')?.getAttribute('data-id') ?? null
    return id && id !== draggingId ? id : null
  }

  const onTapNode = (id: string) => {
    if (ui.linkingFrom && ui.linkingFrom !== id) {
      const error = addCrossLink(ui.linkingFrom, id)
      ui.showToast(error ?? `Linked to “${graph.nodes[id]?.title || 'Untitled'}”.`)
      ui.startLink(null)
      return
    }
    // Tapping a root focuses its branch; tapping the focused root opens it.
    const isRoot = index.rootIds.includes(id)
    if (isRoot && ui.focusRootId !== id) {
      ui.focusRoot(id)
      return
    }
    ui.select(id)
  }

  const onWheel = (e: React.WheelEvent) => {
    const rect = hostRef.current!.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) {
      viewport.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.01))
    } else {
      viewport.panBy(-e.deltaX, -e.deltaY)
    }
  }

  /* Every way the pointer can leave without a pointerup settles the graph. */
  useEffect(() => {
    const release = () => eng.releaseCursor()
    const onVisibility = () => document.visibilityState === 'hidden' && release()
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerleave', release)
    return () => {
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerleave', release)
    }
  }, [eng])

  const visibleIds = useMemo(() => [...Object.keys(layout.pos), ...exiting], [layout, exiting])
  const highlight = new Set(ui.highlightIds)

  return (
    <div
      ref={hostRef}
      className="canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => eng.releaseCursor()}
      onWheel={onWheel}
      onKeyDown={(e) => {
        const id = nodeIdAt(e.target)
        if (!id) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onTapNode(id)
        }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault()
          const rect = (e.target as HTMLElement).getBoundingClientRect()
          setMenu({ id, x: rect.left + rect.width / 2, y: rect.bottom })
        }
      }}
      onContextMenu={(e) => {
        const id = nodeIdAt(e.target)
        if (!id) return
        e.preventDefault()
        setMenu({ id, x: e.clientX, y: e.clientY })
      }}
    >
      <svg className="edges" aria-hidden="true">
        <g ref={edgeLayer}>
          {edges.map((spec) => (
            <Edge
              key={spec.key}
              spec={spec}
              engine={eng}
              stroke={edgeColor(spec)}
              dimmed={Boolean(ui.focusRootId && index.rootIdOf[spec.to] !== ui.focusRootId)}
            />
          ))}
        </g>
      </svg>

      <div className="nodes" ref={nodeLayer}>
        {visibleIds.map((id) => {
          const node = index.byId[id]
          if (!node) return null
          const ms = milestonesOf(graph, id)
          const isCollapsedRoot = collapsed.includes(id)
          return (
            <NodeCard
              key={id}
              node={node}
              tint={tints[id]}
              collapsedCount={isCollapsedRoot ? (index.subtreeSize[id] ?? 1) - 1 : null}
              milestonesDone={ms.filter((m) => m.done).length}
              milestonesTotal={ms.length}
              dragging={drag?.id === id}
              dropTarget={drag?.over === id}
              dimmed={Boolean(ui.focusRootId && index.rootIdOf[id] !== ui.focusRootId)}
              highlighted={highlight.has(id)}
              linking={ui.linkingFrom === id}
              engine={eng}
            />
          )
        })}
      </div>

      {menu ? (
        <NodeMenu
          menu={menu}
          isRoot={index.rootIds.includes(menu.id)}
          collapsed={collapsed.includes(menu.id)}
          hasChildren={(index.childrenOf[menu.id]?.length ?? 0) > 0}
          onClose={() => setMenu(null)}
          onCollapse={() => toggleCollapse(menu.id)}
        />
      ) : null}

      <Minimap viewport={viewport} layout={layout} tints={tints} host={hostRef} />

      {index.live.length === 0 ? <EmptyCanvas /> : null}
    </div>
  )
}

/** Its own component so the engine registration ref stays stable. */
const Edge = memo(function Edge({
  spec,
  engine,
  stroke,
  dimmed,
}: {
  spec: EdgeSpec
  engine: CanvasEngine
  stroke: string
  dimmed: boolean
}) {
  const register = useCallback((el: SVGPathElement | null) => engine.registerEdge(spec, el), [engine, spec])
  return (
    <path
      ref={register}
      className="edge"
      data-key={spec.key}
      data-kind={spec.kind}
      // Normalised length lets the draw-in animation work whatever the path's
      // real length is. Cross-links keep user units, or their dash pattern
      // would rescale with it.
      pathLength={spec.kind === 'primary' ? 1 : undefined}
      data-dimmed={dimmed || undefined}
      stroke={stroke}
      fill="none"
    />
  )
})

function NodeMenu({
  menu,
  isRoot,
  collapsed,
  hasChildren,
  onClose,
  onCollapse,
}: {
  menu: { id: string; x: number; y: number }
  isRoot: boolean
  collapsed: boolean
  hasChildren: boolean
  onClose: () => void
  onCollapse: () => void
}) {
  const startAdd = useUI((s) => s.startAdd)
  const startLink = useUI((s) => s.startLink)
  const select = useUI((s) => s.select)
  const resetOffset = useData((s) => s.resetOffset)
  const node = useData((s) => s.graph.nodes[menu.id])
  const offset = node?.offset

  return createPortal(
    <>
      <div className="menu-scrim canvas-overlay" onPointerDown={onClose} />
      <div className="menu canvas-overlay" style={{ left: menu.x, top: menu.y }} role="menu">
        <button
          role="menuitem"
          onClick={() => {
            startAdd({ fromId: menu.id, kind: 'advance' })
            onClose()
          }}
        >
          <Icon name="arrow-down" size={17} />
          <span>
            Advance
            <em>the same skill, one step on</em>
          </span>
        </button>
        <button
          role="menuitem"
          onClick={() => {
            startAdd({ fromId: menu.id, kind: 'branch' })
            onClose()
          }}
        >
          <Icon name="arrow-elbow-down-right" size={17} />
          <span>
            Branch
            <em>{isRoot ? 'a new skill in this domain' : 'a new skill alongside it'}</em>
          </span>
        </button>
        <hr />
        <button role="menuitem" onClick={() => { select(menu.id); onClose() }}>
          <Icon name="note-pencil" size={17} />
          <span>Open</span>
        </button>
        <button role="menuitem" onClick={() => { startLink(menu.id); onClose() }}>
          <Icon name="link" size={17} />
          <span>Cross-link to…</span>
        </button>
        {isRoot && hasChildren ? (
          <button role="menuitem" onClick={() => { onCollapse(); onClose() }}>
            <Icon name={collapsed ? 'arrows-out-simple' : 'arrows-in-simple'} size={17} />
            <span>{collapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        ) : null}
        {offset && (offset.dx !== 0 || offset.dy !== 0) ? (
          <button role="menuitem" onClick={() => { resetOffset(menu.id); onClose() }}>
            <Icon name="crosshair-simple" size={17} />
            <span>Reset position</span>
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  )
}

function EmptyCanvas() {
  const startAdd = useUI((s) => s.startAdd)
  return (
    <div className="empty-canvas canvas-overlay">
      <div className="empty-art">
        <Icon name="tree" size={40} />
      </div>
      <h2>Create your first branch</h2>
      <p>Name something you are learning. Everything else grows out of it.</p>
      <button className="btn btn-primary" onClick={() => startAdd({ fromId: null, kind: 'root' })}>
        Plant a root
      </button>
    </div>
  )
}

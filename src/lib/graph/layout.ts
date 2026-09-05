import dagre from '@dagrejs/dagre'
import type { SkillNode } from '../../types'
import type { GraphIndex } from './graph'

export const NODE_W = 132
export const NODE_H = 104

/** Vertical gap between ranks, horizontal gap between siblings. */
const RANK_SEP = 62
const NODE_SEP = 26
/** Between whole root subgraphs. Generous, but short enough that a cross-link
 *  between adjacent roots stays readable. */
const ROOT_GAP = 128

export type Pos = { x: number; y: number }
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export type Layout = {
  /** Top-left of each visible node, with its manual offset already applied. */
  pos: Record<string, Pos>
  /** Nodes hidden inside a collapsed root. */
  hidden: Set<string>
  /** Where an edge to a hidden node should terminate instead — its collapsed root. */
  standInFor: Record<string, string>
  bounds: Bounds
}

export const center = (p: Pos): Pos => ({ x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 })

/**
 * The orchard: every root is laid out as its own subgraph, then the subgraphs
 * are placed left to right in the user's chosen root order, all hanging from a
 * shared top line.
 *
 * Only primary edges go into dagre. That keeps rank identical to primary depth,
 * which is what lets vertical position, depth and tint step all say the same
 * thing. Cross-links are drawn over the result rather than laid out (see
 * docs/DECISIONS.md).
 */
export function layoutGraph(index: GraphIndex, collapsedRootIds: string[]): Layout {
  const collapsed = new Set(collapsedRootIds.filter((id) => index.rootIds.includes(id)))
  const pos: Record<string, Pos> = {}
  const hidden = new Set<string>()
  const standInFor: Record<string, string> = {}

  let cursorX = 0

  for (const rootId of index.rootIds) {
    if (collapsed.has(rootId)) {
      pos[rootId] = { x: cursorX, y: 0 }
      for (const d of collectSubtree(index, rootId)) {
        if (d !== rootId) {
          hidden.add(d)
          standInFor[d] = rootId
        }
      }
      cursorX += NODE_W + ROOT_GAP
      continue
    }

    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', ranksep: RANK_SEP, nodesep: NODE_SEP, marginx: 0, marginy: 0 })
    g.setDefaultEdgeLabel(() => ({}))

    const members = collectSubtree(index, rootId)
    for (const id of members) g.setNode(id, { width: NODE_W, height: NODE_H })
    for (const id of members) {
      for (const child of index.childrenOf[id] ?? []) g.setEdge(id, child)
    }
    dagre.layout(g)

    // dagre reports centres in its own space; normalise to a top-left origin so
    // every root subgraph hangs from the same top line.
    let minX = Infinity
    let minY = Infinity
    for (const id of members) {
      const n = g.node(id)
      minX = Math.min(minX, n.x - NODE_W / 2)
      minY = Math.min(minY, n.y - NODE_H / 2)
    }
    let width = 0
    for (const id of members) {
      const n = g.node(id)
      pos[id] = { x: cursorX + (n.x - NODE_W / 2 - minX), y: n.y - NODE_H / 2 - minY }
      width = Math.max(width, pos[id].x - cursorX + NODE_W)
    }
    cursorX += width + ROOT_GAP
  }

  // Manual nudges are applied on top of the tidy result, never instead of it,
  // so the graph re-tidies correctly when a node is added anywhere.
  for (const node of index.live) {
    const p = pos[node.id]
    if (!p) continue
    p.x += node.offset.dx
    p.y += node.offset.dy
  }

  return { pos, hidden, standInFor, bounds: boundsOf(pos) }
}

function collectSubtree(index: GraphIndex, rootId: string): string[] {
  const out: string[] = []
  const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    stack.push(...(index.childrenOf[cur] ?? []))
  }
  return out
}

export function boundsOf(pos: Record<string, Pos>): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of Object.values(pos)) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + NODE_W)
    maxY = Math.max(maxY, p.y + NODE_H)
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: NODE_W, maxY: NODE_H }
  return { minX, minY, maxX, maxY }
}

/** The offset that pins a node at an arbitrary dragged position. */
export function offsetForDrop(node: SkillNode, laidOut: Pos, dropped: Pos): { dx: number; dy: number } {
  return {
    dx: Math.round(node.offset.dx + (dropped.x - laidOut.x)),
    dy: Math.round(node.offset.dy + (dropped.y - laidOut.y)),
  }
}

/**
 * A curve between two node centres. The graph flows downward, so an edge routes
 * vertically whenever the child is genuinely below; a cross-link that runs
 * sideways or up routes horizontally instead. Anchoring and curve shape come
 * from the same decision, so the ends always meet the card cleanly.
 */
export function edgePath(from: Pos, to: Pos): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const vertical = dy >= 24 || Math.abs(dy) >= Math.abs(dx)

  if (vertical) {
    const a = { x: from.x, y: from.y + Math.sign(dy || 1) * (NODE_H / 2 - 8) }
    const b = { x: to.x, y: to.y - Math.sign(dy || 1) * (NODE_H / 2 - 8) }
    const k = Math.max(24, Math.abs(b.y - a.y) * 0.45)
    return `M${a.x},${a.y} C${a.x},${a.y + Math.sign(dy || 1) * k} ${b.x},${b.y - Math.sign(dy || 1) * k} ${b.x},${b.y}`
  }

  // A sideways link leaves from the foot of each card and swings below the row,
  // so it stays readable instead of cutting through whatever sits between them.
  const side = Math.sign(dx || 1)
  const a = { x: from.x + side * (NODE_W / 2 - 22), y: from.y + NODE_H / 2 - 12 }
  const b = { x: to.x - side * (NODE_W / 2 - 22), y: to.y + NODE_H / 2 - 12 }
  const k = Math.max(40, Math.abs(b.x - a.x) * 0.3)
  const sag = Math.min(96, Math.max(34, Math.abs(b.x - a.x) * 0.14))
  return `M${a.x},${a.y} C${a.x + side * k},${a.y + sag} ${b.x - side * k},${b.y + sag} ${b.x},${b.y}`
}

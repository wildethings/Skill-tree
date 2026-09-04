import type { Graph, LogEntry, Milestone, SkillNode } from '../../types'

/** Derived view of the graph. Rebuilt whenever the graph changes; never persisted. */
export type GraphIndex = {
  byId: Record<string, SkillNode>
  live: SkillNode[]
  /** Roots in user-controlled left-to-right order. */
  rootIds: string[]
  /** Children reached through primaryParentId — the structural spanning tree. */
  childrenOf: Record<string, string[]>
  /** Children reached through a non-primary parent — the cross-links. */
  crossChildrenOf: Record<string, string[]>
  depth: Record<string, number>
  rootIdOf: Record<string, string>
  /** D: the deepest depth anywhere under this root. Drives the tint ramp. */
  maxDepthOfRoot: Record<string, number>
  /** Primary-descendant count, self included. Drives the collapsed-root badge. */
  subtreeSize: Record<string, number>
}

const alive = (n: { deletedAt: string | null }) => n.deletedAt === null

const byCreated = (a: SkillNode, b: SkillNode) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)

export function buildIndex(graph: Graph): GraphIndex {
  const live = Object.values(graph.nodes).filter(alive).sort(byCreated)
  const byId: Record<string, SkillNode> = {}
  for (const n of live) byId[n.id] = n

  const childrenOf: Record<string, string[]> = {}
  const crossChildrenOf: Record<string, string[]> = {}
  for (const n of live) {
    childrenOf[n.id] ??= []
    crossChildrenOf[n.id] ??= []
  }

  const primaryParent = (n: SkillNode): string | null => {
    const parents = n.parentIds.filter((id) => byId[id])
    if (parents.length === 0) return null
    // Self-heal a dangling primary rather than orphaning the node.
    return n.primaryParentId && parents.includes(n.primaryParentId) ? n.primaryParentId : parents[0]
  }

  for (const n of live) {
    const primary = primaryParent(n)
    if (primary) childrenOf[primary].push(n.id)
    for (const p of n.parentIds) {
      if (p !== primary && byId[p]) crossChildrenOf[p].push(n.id)
    }
  }

  const explicitOrder = graph.prefs.rootOrder
  const rootIds = live
    .filter((n) => primaryParent(n) === null)
    .sort((a, b) => {
      const ia = explicitOrder.indexOf(a.id)
      const ib = explicitOrder.indexOf(b.id)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1 // ordered roots sit ahead of ones the user hasn't placed
      if (ib !== -1) return 1
      return byCreated(a, b)
    })
    .map((n) => n.id)

  const depth: Record<string, number> = {}
  const rootIdOf: Record<string, string> = {}
  const maxDepthOfRoot: Record<string, number> = {}
  const subtreeSize: Record<string, number> = {}

  // Iterative DFS over the primary spanning tree: depth down, subtree size up.
  // Depth comes from the traversal rather than the stored primaryParentId, so a
  // self-healed primary parent still yields a correct depth.
  const seen = new Set<string>()
  for (const rootId of rootIds) {
    maxDepthOfRoot[rootId] = 0
    const stack: Array<{ id: string; d: number; entered: boolean }> = [{ id: rootId, d: 0, entered: false }]
    while (stack.length) {
      const frame = stack.pop()!
      if (!frame.entered) {
        if (seen.has(frame.id)) continue // defensive: never loop on corrupted data
        seen.add(frame.id)
        depth[frame.id] = frame.d
        rootIdOf[frame.id] = rootId
        maxDepthOfRoot[rootId] = Math.max(maxDepthOfRoot[rootId], frame.d)
        stack.push({ ...frame, entered: true })
        for (const c of childrenOf[frame.id]) stack.push({ id: c, d: frame.d + 1, entered: false })
      } else {
        subtreeSize[frame.id] = 1 + childrenOf[frame.id].reduce((sum, c) => sum + (subtreeSize[c] ?? 1), 0)
      }
    }
  }

  return { byId, live, rootIds, childrenOf, crossChildrenOf, depth, rootIdOf, maxDepthOfRoot, subtreeSize }
}

/** Every primary descendant of `id`, self excluded. */
export function descendantsOf(index: GraphIndex, id: string): string[] {
  const out: string[] = []
  const stack = [...(index.childrenOf[id] ?? [])]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    stack.push(...(index.childrenOf[cur] ?? []))
  }
  return out
}

/** Walks every parent edge, not only the primary one — cycles can hide in cross-links. */
export function isAncestor(graph: Graph, ancestorId: string, nodeId: string): boolean {
  const seen = new Set<string>()
  const stack = [nodeId]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === ancestorId && cur !== nodeId) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    const node = graph.nodes[cur]
    if (!node || node.deletedAt) continue
    for (const p of node.parentIds) {
      if (p === ancestorId) return true
      stack.push(p)
    }
  }
  return false
}

export type Validation = { ok: true } | { ok: false; message: string }

/** Guards every structural edit. Rejects cycles, self-parenting and a bad primary. */
export function validateParents(
  graph: Graph,
  nodeId: string,
  parentIds: string[],
  primaryParentId: string | null,
): Validation {
  const unique = [...new Set(parentIds)]
  if (unique.includes(nodeId)) return { ok: false, message: 'A node cannot be its own parent.' }

  for (const p of unique) {
    const parent = graph.nodes[p]
    if (!parent || parent.deletedAt) return { ok: false, message: 'That parent no longer exists.' }
    if (isAncestor(graph, nodeId, p)) {
      return {
        ok: false,
        message: `“${parent.title}” already grows out of “${graph.nodes[nodeId]?.title ?? 'this node'}”, so linking it back would make a loop.`,
      }
    }
  }

  if (unique.length > 0 && (primaryParentId === null || !unique.includes(primaryParentId))) {
    return { ok: false, message: 'A node with parents needs one of them marked as its main parent.' }
  }
  if (unique.length === 0 && primaryParentId !== null) {
    return { ok: false, message: 'A root cannot have a main parent.' }
  }
  return { ok: true }
}

export const milestonesOf = (graph: Graph, nodeId: string): Milestone[] =>
  Object.values(graph.milestones)
    .filter((m) => m.nodeId === nodeId && alive(m))
    .sort((a, b) => a.order - b.order)

export const entriesOf = (graph: Graph, nodeId: string): LogEntry[] =>
  Object.values(graph.entries)
    .filter((e) => e.nodeId === nodeId && alive(e))
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))

export const liveEntries = (graph: Graph): LogEntry[] =>
  Object.values(graph.entries).filter((e) => alive(e) && graph.nodes[e.nodeId]?.deletedAt === null)

export const liveMilestones = (graph: Graph): Milestone[] =>
  Object.values(graph.milestones).filter((m) => alive(m) && graph.nodes[m.nodeId]?.deletedAt === null)

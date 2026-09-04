import type { Graph, SkillNode } from '../src/types'
import { emptyGraph } from '../src/types'

export const USER = 'u1'

export function node(id: string, parents: string[] = [], extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id,
    userId: USER,
    title: id,
    icon: 'diamond',
    parentIds: parents,
    primaryParentId: parents[0] ?? null,
    baseColor: parents.length === 0 ? 'oklch(0.32 0.09 264)' : null,
    state: 'started',
    offset: { dx: 0, dy: 0 },
    createdAt: `2026-01-01T00:00:${String(seq++).padStart(2, '0')}.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...extra,
  }
}
let seq = 0

export function graphOf(...nodes: SkillNode[]): Graph {
  const g = emptyGraph(USER)
  for (const n of nodes) g.nodes[n.id] = n
  return g
}

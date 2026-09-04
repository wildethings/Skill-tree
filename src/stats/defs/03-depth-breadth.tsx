import type { StatModule } from '../registry'
import { Bars } from '../parts'

/**
 * The most informative stat here: depth 1 against breadth 9 means nine things
 * started and none advanced.
 */
export const stat: StatModule = {
  id: 'depth-breadth',
  title: 'Depth vs breadth',
  size: 'large',
  compute: ({ index, nodes }) => {
    const counted = new Set(nodes.map((n) => n.id))
    const rows = index.rootIds.map((rootId) => {
      const members = nodes.filter((n) => index.rootIdOf[n.id] === rootId)
      const deepest = members.reduce((max, n) => Math.max(max, index.depth[n.id] ?? 0), 0)
      return {
        id: rootId,
        label: index.byId[rootId].title || 'Untitled',
        depth: counted.has(rootId) || members.length ? deepest : 0,
        breadth: members.length,
      }
    })
    if (rows.length === 0) return <p className="stat-empty">No roots yet.</p>

    const maxBreadth = Math.max(...rows.map((r) => r.breadth), 1)
    const maxDepth = Math.max(...rows.map((r) => r.depth), 1)
    return (
      <Bars
        rows={rows.map((r) => ({
          id: r.id,
          label: r.label,
          series: [
            { key: 'depth', value: r.depth, ratio: r.depth / maxDepth, caption: `depth ${r.depth}` },
            { key: 'breadth', value: r.breadth, ratio: r.breadth / maxBreadth, caption: `${r.breadth} nodes` },
          ],
        }))}
      />
    )
  },
}

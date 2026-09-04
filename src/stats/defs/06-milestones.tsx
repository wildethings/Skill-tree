import type { StatModule } from '../registry'
import { liveMilestones } from '../../lib/graph/graph'
import { Bars, Big } from '../parts'

export const stat: StatModule = {
  id: 'milestones',
  title: 'Milestones',
  size: 'medium',
  compute: ({ graph, index }) => {
    const all = liveMilestones(graph)
    const done = all.filter((m) => m.done).length
    const perRoot = index.rootIds.map((rootId) => {
      const mine = all.filter((m) => index.rootIdOf[m.nodeId] === rootId)
      return {
        id: rootId,
        label: index.byId[rootId].title || 'Untitled',
        done: mine.filter((m) => m.done).length,
        total: mine.length,
      }
    }).filter((r) => r.total > 0)

    return (
      <>
        <Big value={`${done}/${all.length}`} note={all.length ? 'completed' : 'none written yet'} />
        {perRoot.length > 0 ? (
          <Bars
            rows={perRoot.map((r) => ({
              id: r.id,
              label: r.label,
              series: [{ key: 'done', value: r.done, ratio: r.total ? r.done / r.total : 0, caption: `${r.done}/${r.total}` }],
            }))}
          />
        ) : null}
      </>
    )
  },
}

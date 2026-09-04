import type { StatModule } from '../registry'
import { liveEntries } from '../../lib/graph/graph'
import { formatDay } from '../../lib/date'
import { Rows } from '../parts'

export const stat: StatModule = {
  id: 'branch-age',
  title: 'Branch age',
  size: 'medium',
  compute: ({ graph, index }) => {
    const entries = liveEntries(graph)
    const rows = index.rootIds.map((rootId) => {
      const mine = entries.filter((e) => index.rootIdOf[e.nodeId] === rootId)
      const first = mine.reduce<string | null>((min, e) => (!min || e.date < min ? e.date : min), null)
      return {
        id: rootId,
        label: index.byId[rootId].title || 'Untitled',
        value: first ? formatDay(first) : '—',
        note: `${mine.length} ${mine.length === 1 ? 'entry' : 'entries'}`,
      }
    })
    return rows.length ? <Rows rows={rows} /> : <p className="stat-empty">No roots yet.</p>
  },
}

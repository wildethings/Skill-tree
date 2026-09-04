import type { StatModule } from '../registry'
import { Big, Chips } from '../parts'

export const stat: StatModule = {
  id: 'cross-links',
  title: 'Cross-links',
  size: 'small',
  compute: ({ index }) => {
    const linked = index.live.filter((n) => n.parentIds.filter((p) => index.byId[p]).length > 1)
    return (
      <>
        <Big value={linked.length} note={linked.length ? 'nodes with two parents' : 'none yet'} />
        <Chips items={linked.slice(0, 6).map((n) => ({ id: n.id, label: n.title || 'Untitled', icon: n.icon }))} />
      </>
    )
  },
}

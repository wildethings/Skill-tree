import type { StatModule } from '../registry'
import { Big, Chips } from '../parts'

/** Started nodes with nothing below them — the edges available to push next. */
export const stat: StatModule = {
  id: 'frontier',
  title: 'Frontier',
  size: 'medium',
  compute: ({ index }) => {
    const frontier = index.live.filter(
      (n) => n.state === 'started' && (index.childrenOf[n.id]?.length ?? 0) === 0,
    )
    return (
      <>
        <Big value={frontier.length} note="started, nothing below yet" />
        <Chips items={frontier.slice(0, 14).map((n) => ({ id: n.id, label: n.title || 'Untitled', icon: n.icon }))} />
      </>
    )
  },
}

import type { StatModule } from '../registry'
import { liveEntries } from '../../lib/graph/graph'
import { Big } from '../parts'

export const stat: StatModule = {
  id: 'entries',
  title: 'Entries',
  size: 'small',
  compute: ({ graph }) => {
    const entries = liveEntries(graph)
    const withPhotos = entries.filter((e) => e.photoIds.length > 0).length
    return <Big value={entries.length} note={withPhotos ? `${withPhotos} with photos` : 'logged'} />
  },
}

import type { StatModule } from '../registry'
import { Big } from '../parts'

export const stat: StatModule = {
  id: 'nodes',
  title: 'Nodes',
  size: 'small',
  compute: ({ nodes, index }) => (
    <Big value={nodes.length} note={`${index.rootIds.length} ${index.rootIds.length === 1 ? 'root' : 'roots'}`} />
  ),
}

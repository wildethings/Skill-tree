import type { Graph, User } from '../types'

export type ExportFile = {
  format: 'skill-tree/v1'
  exportedAt: string
  user: Pick<User, 'id' | 'email' | 'displayName' | 'createdAt'>
  nodes: Graph['nodes'][string][]
  milestones: Graph['milestones'][string][]
  entries: Graph['entries'][string][]
  photos: Graph['photos'][string][]
  preferences: Graph['prefs']
}

/** Everything, deleted rows included — an export should be able to restore. */
export function buildExport(graph: Graph, user: User): ExportFile {
  return {
    format: 'skill-tree/v1',
    exportedAt: new Date().toISOString(),
    user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
    nodes: Object.values(graph.nodes),
    milestones: Object.values(graph.milestones),
    entries: Object.values(graph.entries),
    photos: Object.values(graph.photos),
    preferences: graph.prefs,
  }
}

export function downloadExport(graph: Graph, user: User) {
  const blob = new Blob([JSON.stringify(buildExport(graph, user), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `skill-tree-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

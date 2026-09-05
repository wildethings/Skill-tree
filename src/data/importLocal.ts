import type { Graph, User } from '../types'
import { kvGet, kvSet, idbAvailable } from './idb'
import type { Row } from './adapter'
import { now } from '../lib/id'

/**
 * Rescues a graph built in local mode once the app is pointed at a backend.
 *
 * Local mode keeps everything under a device-local user id. When Supabase
 * credentials appear, the app switches accounts entirely and that graph would
 * otherwise become invisible with no way back — so it is found, offered, and
 * only ever copied. Nothing here deletes anything.
 */

const USER_KEY = 'local:user'
const graphKey = (userId: string) => `local:graph:${userId}`
const importedKey = (localId: string, cloudId: string) => `local:imported:${localId}:${cloudId}`

export type LocalSnapshot = {
  localUserId: string
  graph: Graph
  nodes: number
  entries: number
  milestones: number
  photos: number
}

/** The device's local-mode graph, if there is one worth offering. */
export async function findLocalGraph(cloudUserId: string): Promise<LocalSnapshot | null> {
  if (!idbAvailable()) return null
  try {
    const localUser = await kvGet<User>(USER_KEY)
    if (!localUser) return null
    if (localUser.id === cloudUserId) return null // already the signed-in account

    if (await kvGet<string>(importedKey(localUser.id, cloudUserId))) return null

    const graph = await kvGet<Graph>(graphKey(localUser.id))
    if (!graph) return null

    const live = <T extends { deletedAt: string | null }>(r: Record<string, T>) =>
      Object.values(r).filter((x) => x.deletedAt === null).length

    const nodes = live(graph.nodes)
    if (nodes === 0) return null

    return {
      localUserId: localUser.id,
      graph,
      nodes,
      entries: live(graph.entries),
      milestones: live(graph.milestones),
      photos: Object.keys(graph.photos).length,
    }
  } catch {
    return null // a missing or unreadable local store is simply nothing to offer
  }
}

/**
 * Re-keys a local graph onto the signed-in account. Row ids are random UUIDs,
 * so they carry over untouched and cannot collide with anything already in the
 * account — an import adds roots alongside whatever is there rather than
 * replacing it.
 */
export function rowsForImport(snapshot: LocalSnapshot, user: User): { rows: Row[]; graph: Graph } {
  const stamp = now()
  const graph: Graph = structuredClone(snapshot.graph)

  for (const node of Object.values(graph.nodes)) {
    node.userId = user.id
    node.updatedAt = stamp
  }
  for (const photo of Object.values(graph.photos)) photo.userId = user.id
  for (const m of Object.values(graph.milestones)) m.updatedAt = stamp
  for (const e of Object.values(graph.entries)) e.updatedAt = stamp
  graph.prefs = { ...graph.prefs, userId: user.id, updatedAt: stamp }

  const rows: Row[] = [
    // Photos first: a log entry references them by id.
    ...Object.values(graph.photos).map((data) => ({ table: 'photos' as const, data })),
    ...Object.values(graph.nodes).map((data) => ({ table: 'nodes' as const, data })),
    ...Object.values(graph.milestones).map((data) => ({ table: 'milestones' as const, data })),
    ...Object.values(graph.entries).map((data) => ({ table: 'entries' as const, data })),
    { table: 'prefs' as const, data: graph.prefs },
  ]
  return { rows, graph }
}

/**
 * Recorded only after the upload has been confirmed, and it records nothing
 * more than "do not offer this again". The device copy is left where it is.
 */
export async function markImported(localUserId: string, cloudUserId: string): Promise<void> {
  if (!idbAvailable()) return
  try {
    await kvSet(importedKey(localUserId, cloudUserId), now())
  } catch {
    /* worst case the prompt appears once more; the import itself is idempotent */
  }
}

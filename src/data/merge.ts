import type { Graph } from '../types'

type Stamped = { updatedAt: string; deletedAt?: string | null }

const pick = <T extends Stamped>(mine: T | undefined, theirs: T | undefined): T =>
  (mine && theirs ? (mine.updatedAt > theirs.updatedAt ? mine : theirs) : (mine ?? theirs))!

const mergeTable = <T extends Stamped>(mine: Record<string, T>, theirs: Record<string, T>): Record<string, T> => {
  const out: Record<string, T> = {}
  for (const id of new Set([...Object.keys(mine), ...Object.keys(theirs)])) out[id] = pick(mine[id], theirs[id])
  return out
}

/**
 * Last-write-wins per record, the same rule the server applies.
 *
 * This is what makes a load safe to apply at any moment: edits made while the
 * initial fetch was in flight survive it, and a second load cannot roll the
 * graph back to what the server had when it started.
 */
export function mergeGraph(mine: Graph, theirs: Graph): Graph {
  return {
    nodes: mergeTable(mine.nodes, theirs.nodes),
    milestones: mergeTable(mine.milestones, theirs.milestones),
    entries: mergeTable(mine.entries, theirs.entries),
    // Photos are immutable once uploaded, so either copy will do.
    photos: { ...theirs.photos, ...mine.photos },
    prefs: mine.prefs.updatedAt > theirs.prefs.updatedAt ? mine.prefs : theirs.prefs,
  }
}

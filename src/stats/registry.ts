import type { ReactNode } from 'react'
import type { Graph } from '../types'
import type { GraphIndex } from '../lib/graph/graph'

export type StatSize = 'small' | 'medium' | 'large'

export type StatContext = {
  graph: Graph
  index: GraphIndex
  /** Whether `planned` nodes count. A user preference, not a hard rule. */
  countPlanned: boolean
  /** The nodes a stat should count, already filtered by that preference. */
  nodes: GraphIndex['live']
}

export type StatModule = {
  id: string
  title: string
  size: StatSize
  /** Takes the whole graph, returns something renderable. Nothing self-assigned. */
  compute: (ctx: StatContext) => ReactNode
}

/**
 * Every module in ./defs is registered automatically, so adding a stat is
 * adding one file — the grid arranges whatever it finds and never needs editing.
 */
const modules = import.meta.glob<{ stat: StatModule }>('./defs/*.tsx', { eager: true })

export const STATS: StatModule[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, m]) => m.stat)

export const statById = (id: string): StatModule | undefined => STATS.find((s) => s.id === id)

/** Registered order, with the user's own order applied on top. */
export function orderedStats(order: string[], hidden: string[]): StatModule[] {
  const rank = (s: StatModule) => {
    const i = order.indexOf(s.id)
    return i === -1 ? order.length + STATS.indexOf(s) : i
  }
  return STATS.filter((s) => !hidden.includes(s.id)).sort((a, b) => rank(a) - rank(b))
}

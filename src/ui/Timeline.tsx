import { useMemo } from 'react'
import type { SkillNode } from '../types'
import { useData } from '../data/store'
import { useUI } from './uiStore'
import { useTheme } from './useTheme'
import { liveEntries } from '../lib/graph/graph'
import { tintMap } from '../lib/color/tint'
import { formatDayShort, formatMonth, monthKey } from '../lib/date'
import { Icon } from './Icon'

type Item = {
  id: string
  date: string
  nodeId: string
  kind: 'entry' | 'created'
  note: string
  photoIds: string[]
  /** Other nodes created the same day, folded into this row. */
  alsoCreated: string[]
}

/**
 * A day's worth of node births collapses into one row. Mapping out a branch
 * creates several nodes at once, and a row each would bury the actual log.
 */
function foldCreations(nodes: SkillNode[]): Item[] {
  const byDay = new Map<string, SkillNode[]>()
  for (const node of nodes) {
    const day = node.createdAt.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), node])
  }
  return [...byDay.entries()].map(([date, sameDay]) => {
    const [first, ...rest] = sameDay
    return {
      id: `created-${date}-${first.id}`,
      date,
      nodeId: first.id,
      kind: 'created' as const,
      note: '',
      photoIds: [],
      alsoCreated: rest.map((n) => n.id),
    }
  })
}

/** What the summer actually produced: every entry and every node birth, in date order. */
export function Timeline() {
  const graph = useData((s) => s.graph)
  const index = useData((s) => s.index)
  const theme = useTheme()
  const select = useUI((s) => s.select)
  const setView = useUI((s) => s.setView)
  const tints = useMemo(() => tintMap(index, theme), [index, theme])

  const months = useMemo(() => {
    const items: Item[] = [
      ...liveEntries(graph).map((e) => ({
        id: e.id,
        date: e.date.slice(0, 10),
        nodeId: e.nodeId,
        kind: 'entry' as const,
        note: e.note,
        photoIds: e.photoIds,
        alsoCreated: [],
      })),
      ...foldCreations(index.live),
    ].sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : b.date.localeCompare(a.date)))

    const grouped: Array<{ key: string; items: Item[] }> = []
    for (const item of items) {
      const key = monthKey(item.date)
      const last = grouped[grouped.length - 1]
      if (last?.key === key) last.items.push(item)
      else grouped.push({ key, items: [item] })
    }
    return grouped
  }, [graph, index])

  if (months.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Timeline</h1>
        </header>
        <p className="empty-note">Nothing has happened yet. Log something on a node and it shows up here.</p>
      </div>
    )
  }

  const open = (nodeId: string) => {
    setView('canvas')
    select(nodeId)
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Timeline</h1>
      </header>

      {months.map((month) => (
        <section key={month.key} className="month">
          <h2 className="month-head">{formatMonth(month.key)}</h2>
          <ul className="timeline">
            {month.items.map((item) => {
              const node = index.byId[item.nodeId]
              if (!node) return null
              const tint = tints[item.nodeId]
              return (
                <li key={item.id} data-kind={item.kind}>
                  <time>{formatDayShort(item.date)}</time>
                  <span className="timeline-dot" style={{ background: tint?.fill }} />
                  <button className="timeline-body" onClick={() => open(item.nodeId)}>
                    <span className="timeline-node">
                      <Icon name={node.icon} size={15} />
                      {node.title || 'Untitled'}
                      {item.kind === 'created' ? (
                        <em>
                          {item.alsoCreated.length
                            ? `and ${item.alsoCreated.length} more started here`
                            : 'started here'}
                        </em>
                      ) : null}
                    </span>
                    {item.alsoCreated.length ? (
                      <p className="timeline-also">
                        {item.alsoCreated.map((id) => index.byId[id]?.title || 'Untitled').join(' · ')}
                      </p>
                    ) : null}
                    {item.note ? <p>{item.note}</p> : null}
                    {item.photoIds.length ? (
                      <span className="thumbs">
                        {item.photoIds.map((id) =>
                          graph.photos[id] ? <img key={id} src={graph.photos[id].url} alt="" loading="lazy" /> : null,
                        )}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

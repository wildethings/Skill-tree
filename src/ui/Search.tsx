import { useEffect, useMemo, useRef } from 'react'
import { useData } from '../data/store'
import { useUI } from './uiStore'
import { entriesOf, milestonesOf } from '../lib/graph/graph'
import { Icon } from './Icon'

type Hit = { nodeId: string; title: string; icon: string; where: string; snippet: string }

/** Titles, milestone text and log notes. Selecting a hit pans to it and highlights it. */
export function Search() {
  const graph = useData((s) => s.graph)
  const index = useData((s) => s.index)
  const ui = useUI()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const hits = useMemo<Hit[]>(() => {
    const q = ui.query.trim().toLowerCase()
    if (q.length < 2) return []
    const out: Hit[] = []
    for (const node of index.live) {
      const title = node.title || 'Untitled'
      if (title.toLowerCase().includes(q)) {
        out.push({ nodeId: node.id, title, icon: node.icon, where: 'name', snippet: title })
        continue
      }
      const milestone = milestonesOf(graph, node.id).find((m) => m.text.toLowerCase().includes(q))
      if (milestone) {
        out.push({ nodeId: node.id, title, icon: node.icon, where: 'milestone', snippet: milestone.text })
        continue
      }
      const entry = entriesOf(graph, node.id).find((e) => e.note.toLowerCase().includes(q))
      if (entry) {
        out.push({ nodeId: node.id, title, icon: node.icon, where: entry.date.slice(0, 10), snippet: entry.note })
      }
    }
    return out.slice(0, 40)
  }, [ui.query, graph, index])

  const go = (nodeId: string) => {
    ui.setView('canvas')
    ui.highlight([nodeId])
    ui.openSearch(false)
    ui.select(nodeId)
  }

  return (
    <div className="search-scrim" onPointerDown={(e) => e.target === e.currentTarget && ui.openSearch(false)}>
      <div className="search" role="dialog" aria-modal="true" aria-label="Search">
        <div className="search-head">
          <Icon name="magnifying-glass" size={17} />
          <input
            ref={inputRef}
            value={ui.query}
            onChange={(e) => ui.setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') ui.openSearch(false)
              if (e.key === 'Enter' && hits[0]) go(hits[0].nodeId)
            }}
            placeholder="Search names, milestones and log notes"
            aria-label="Search"
          />
          <kbd>esc</kbd>
        </div>

        {ui.query.trim().length >= 2 ? (
          hits.length ? (
            <ul className="search-hits">
              {hits.map((hit) => (
                <li key={`${hit.nodeId}-${hit.where}`}>
                  <button onClick={() => go(hit.nodeId)}>
                    <Icon name={hit.icon} size={17} />
                    <span className="search-hit-body">
                      <strong>{hit.title}</strong>
                      <em>{hit.snippet}</em>
                    </span>
                    <span className="tag">{hit.where}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-note">Nothing matches “{ui.query.trim()}”.</p>
          )
        ) : (
          <p className="hint search-hint">Type at least two characters.</p>
        )}
      </div>
    </div>
  )
}

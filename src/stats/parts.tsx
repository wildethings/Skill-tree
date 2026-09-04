import { useUI } from '../ui/uiStore'
import { Icon } from '../ui/Icon'

/** Shared display pieces, so a stat module stays a compute function plus a shape. */

export function Big({ value, note }: { value: number | string; note?: string }) {
  return (
    <div className="stat-big">
      <strong>{value}</strong>
      {note ? <span>{note}</span> : null}
    </div>
  )
}

export type BarRow = {
  id: string
  label: string
  series: Array<{ key: string; value: number; ratio: number; caption: string }>
}

export function Bars({ rows }: { rows: BarRow[] }) {
  return (
    <ul className="stat-bars">
      {rows.map((row) => (
        <li key={row.id}>
          <span className="stat-bar-label" title={row.label}>
            {row.label}
          </span>
          <span className="stat-bar-tracks">
            {row.series.map((s) => (
              <span key={s.key} className="stat-track" data-series={s.key}>
                <span style={{ width: `${Math.max(2, s.ratio * 100)}%` }} />
                <em>{s.caption}</em>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Columns({ rows }: { rows: Array<{ id: string; label: string; value: number }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ol className="stat-columns">
      {rows.map((row) => (
        <li key={row.id} title={`${row.label}: ${row.value}`}>
          <span className="stat-column" style={{ height: `${Math.max(4, (row.value / max) * 100)}%` }}>
            <em>{row.value}</em>
          </span>
          <span className="stat-column-label">{row.label}</span>
        </li>
      ))}
    </ol>
  )
}

export function Rows({ rows }: { rows: Array<{ id: string; label: string; value: string; note: string }> }) {
  return (
    <ul className="stat-rows">
      {rows.map((row) => (
        <li key={row.id}>
          <span className="stat-row-label">{row.label}</span>
          <span className="stat-row-value">{row.value}</span>
          <span className="stat-row-note">{row.note}</span>
        </li>
      ))}
    </ul>
  )
}

/** Node chips jump to the node on the canvas rather than being decoration. */
export function Chips({ items }: { items: Array<{ id: string; label: string; icon: string }> }) {
  const setView = useUI((s) => s.setView)
  const highlight = useUI((s) => s.highlight)
  if (items.length === 0) return null
  return (
    <div className="stat-chips">
      {items.map((item) => (
        <button
          key={item.id}
          className="stat-chip"
          onClick={() => {
            setView('canvas')
            highlight([item.id])
          }}
        >
          <Icon name={item.icon} size={14} />
          {item.label}
        </button>
      ))}
    </div>
  )
}

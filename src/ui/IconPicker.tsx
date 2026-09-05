import { useEffect, useMemo, useRef, useState } from 'react'
import { ICON_COUNT, searchIcons } from '../lib/icons/search'
import { Icon } from './Icon'

const CELL = 52
const GAP = 6
const COLUMNS = 7
const VIEWPORT_H = 268

/** Virtualised so the full set stays scrollable without mounting 1,500 SVGs. */
export default function IconPicker({
  value,
  onPick,
  onClose,
}: {
  value: string
  onPick: (name: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [scroll, setScroll] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchIcons(query), [query])

  useEffect(() => inputRef.current?.focus(), [])

  const rowH = CELL + GAP
  const rows = Math.ceil(results.length / COLUMNS)
  const first = Math.max(0, Math.floor(scroll / rowH) - 2)
  const last = Math.min(rows, Math.ceil((scroll + VIEWPORT_H) / rowH) + 2)
  const slice = results.slice(first * COLUMNS, last * COLUMNS)

  return (
    <div className="picker">
      <div className="picker-head">
        <Icon name="magnifying-glass" size={16} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setScroll(0)
          }}
          placeholder={`Search ${ICON_COUNT} icons`}
          aria-label="Search icons"
        />
        <button className="btn-icon" onClick={onClose} aria-label="Close icon picker">
          <Icon name="x" size={15} />
        </button>
      </div>

      <div
        className="picker-grid"
        style={{ height: Math.min(VIEWPORT_H, rows * rowH + 16) }}
        onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
      >
        <div style={{ height: rows * rowH, position: 'relative' }}>
          <div style={{ position: 'absolute', top: first * rowH, display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, ${CELL}px)`, gap: GAP }}>
            {slice.map((name) => (
              <button
                key={name}
                className="picker-cell"
                data-active={name === value || undefined}
                title={name.replace(/-/g, ' ')}
                onClick={() => onPick(name)}
              >
                <Icon name={name} size={24} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {results.length === 0 ? <p className="picker-empty">No icon matches “{query}”.</p> : null}
    </div>
  )
}

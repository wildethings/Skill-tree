import { useState } from 'react'
import { useData } from '../data/store'
import { useUI, type AddIntent } from './uiStore'
import { PALETTE_CSS } from '../lib/color/palette'
import { Icon } from './Icon'
import { IconPickerPanel } from './IconPickerLazy'
import { Sheet } from './Sheet'

/**
 * Two taps from the canvas to a named node. Icon, colour and milestones are all
 * skippable and addable later — the only required move is typing a name.
 */
export function AddNode({ intent }: { intent: AddIntent }) {
  const createRoot = useData((s) => s.createRoot)
  const addNode = useData((s) => s.addNode)
  const parentTitle = useData((s) => (intent.fromId ? s.graph.nodes[intent.fromId]?.title : null))
  const parentIcon = useData((s) => (intent.fromId ? s.graph.nodes[intent.fromId]?.icon : null))
  const usedColors = useData((s) => s.index.rootIds.map((id) => s.graph.nodes[id].baseColor))

  const startAdd = useUI((s) => s.startAdd)
  const select = useUI((s) => s.select)

  const isRoot = intent.kind === 'root'
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState(isRoot ? 'sparkle' : (parentIcon ?? 'sparkle'))
  const [planned, setPlanned] = useState(false)
  const [color, setColor] = useState(
    () => PALETTE_CSS.find((c) => !usedColors.includes(c.value))?.value ?? PALETTE_CSS[0].value,
  )
  const [picking, setPicking] = useState(false)

  const submit = () => {
    const name = title.trim()
    if (!name) return
    const state = planned ? ('planned' as const) : ('started' as const)
    const id = isRoot
      ? createRoot({ title: name, icon, baseColor: color, state })
      : addNode(intent.fromId!, intent.kind as 'advance' | 'branch', { title: name, icon, state })
    startAdd(null)
    if (id) select(id)
  }

  const heading = isRoot
    ? 'New root'
    : intent.kind === 'advance'
      ? `Advance from ${parentTitle || 'Untitled'}`
      : `Branch beside ${parentTitle || 'Untitled'}`

  const hint = isRoot
    ? 'A domain of its own. It picks a base colour; everything below derives its own.'
    : intent.kind === 'advance'
      ? 'The same skill, one step further on.'
      : 'A different skill in the same domain.'

  return (
    <Sheet
      title={heading}
      onClose={() => startAdd(null)}
      footer={
        <>
          <button className="btn" onClick={() => startAdd(null)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!title.trim()}>
            Create
          </button>
        </>
      }
    >
      <p className="hint">{hint}</p>

      <div className="field-row">
        <button
          className="icon-tile-btn"
          onClick={() => setPicking((p) => !p)}
          aria-label="Choose an icon"
          style={{ background: isRoot ? color : 'var(--surface-3)', color: isRoot ? 'oklch(0.985 0.002 265)' : 'var(--text)' }}
        >
          <Icon name={icon} size={26} />
        </button>
        <input
          data-autofocus
          className="field field-lg"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Name it"
          aria-label="Name"
        />
      </div>

      {picking ? <IconPickerPanel value={icon} onPick={(name) => { setIcon(name); setPicking(false) }} onClose={() => setPicking(false)} /> : null}

      {isRoot ? (
        <div className="swatches" role="radiogroup" aria-label="Base colour">
          {PALETTE_CSS.map((c) => (
            <button
              key={c.value}
              role="radio"
              aria-checked={c.value === color}
              aria-label={c.name}
              title={c.name}
              className="swatch"
              data-active={c.value === color || undefined}
              style={{ background: c.value }}
              onClick={() => setColor(c.value)}
            />
          ))}
        </div>
      ) : null}

      <label className="check">
        <input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} />
        <span>
          Planned, not started
          <em>Draws as an outline. Seeing what is ahead is part of the point.</em>
        </span>
      </label>
    </Sheet>
  )
}

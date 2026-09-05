import { useRef, useState } from 'react'
import type { Photo } from '../types'
import { useData } from '../data/store'
import { useUI } from './uiStore'
import { useTheme } from './useTheme'
import { entriesOf, milestonesOf } from '../lib/graph/graph'
import { tintFor } from '../lib/color/tint'
import { css } from '../lib/color/oklch'
import { backend } from '../data/backend'
import { prepareUpload } from '../data/photos'
import { formatDay } from '../lib/date'
import { Icon } from './Icon'
import { IconPickerPanel } from './IconPickerLazy'
import { Sheet } from './Sheet'
import { PhotoThumb } from './PhotoThumb'

export function NodeDetail({ nodeId }: { nodeId: string }) {
  const graph = useData((s) => s.graph)
  const index = useData((s) => s.index)
  const node = graph.nodes[nodeId]
  const theme = useTheme()

  const updateNode = useData((s) => s.updateNode)
  const setState = useData((s) => s.setState)
  const deleteNode = useData((s) => s.deleteNode)
  const removeParent = useData((s) => s.removeParent)
  const addMilestone = useData((s) => s.addMilestone)
  const toggleMilestone = useData((s) => s.toggleMilestone)
  const deleteMilestone = useData((s) => s.deleteMilestone)
  const applyUndo = useData((s) => s.applyUndo)

  const ui = useUI()
  const [picking, setPicking] = useState(false)
  const [logging, setLogging] = useState(false)

  if (!node) return null
  const tint = tintFor(index, nodeId, theme)
  const milestones = milestonesOf(graph, nodeId)
  const entries = entriesOf(graph, nodeId)
  const done = milestones.filter((m) => m.done).length
  const parents = node.parentIds.map((id) => graph.nodes[id]).filter(Boolean)
  const isRoot = node.parentIds.length === 0

  return (
    <Sheet
      title={
        <span className="detail-title">
          <span className="detail-tile" style={{
              background: node.state === 'planned' ? 'transparent' : tint.fill,
              color: node.state === 'planned' ? css(tint.lch) : tint.fg,
            }} data-planned={node.state === 'planned' || undefined}>
            <Icon name={node.icon} size={22} />
          </span>
          <input
            className="detail-name"
            value={node.title}
            placeholder="Untitled"
            onChange={(e) => updateNode(nodeId, { title: e.target.value })}
            aria-label="Title"
          />
        </span>
      }
      onClose={() => ui.select(null)}
      footer={
        <>
          <button className="btn" onClick={() => setLogging(true)}>
            <Icon name="pencil-simple-line" size={16} /> Log
          </button>
          <button className="btn" onClick={() => ui.startAdd({ fromId: nodeId, kind: 'advance' })}>
            <Icon name="arrow-down" size={16} /> Advance
          </button>
          <button className="btn" onClick={() => ui.startAdd({ fromId: nodeId, kind: 'branch' })}>
            <Icon name="arrow-elbow-down-right" size={16} /> Branch
          </button>
        </>
      }
    >
      <div className="detail-chips">
        <button
          className="chip"
          data-on={node.state === 'started' || undefined}
          onClick={() => setState(nodeId, node.state === 'started' ? 'planned' : 'started')}
        >
          {node.state === 'started' ? 'Started' : 'Planned'}
        </button>
        <button className="chip chip-quiet" onClick={() => setPicking((p) => !p)}>
          <Icon name="palette" size={14} /> Icon
        </button>
        <button className="chip chip-quiet" onClick={() => { ui.startLink(nodeId); ui.select(null) }}>
          <Icon name="link" size={14} /> Cross-link
        </button>
        {node.offset.dx || node.offset.dy ? (
          <button className="chip chip-quiet" onClick={() => updateNode(nodeId, { offset: { dx: 0, dy: 0 } })}>
            <Icon name="crosshair-simple" size={14} /> Reset position
          </button>
        ) : null}
      </div>

      {picking ? (
        <IconPickerPanel value={node.icon} onPick={(name) => { updateNode(nodeId, { icon: name }); setPicking(false) }} onClose={() => setPicking(false)} />
      ) : null}

      {parents.length > 1 ? (
        <section className="detail-section">
          <h3>Grows out of</h3>
          <ul className="parent-list">
            {parents.map((p) => (
              <li key={p.id}>
                <button className="linkish" onClick={() => ui.select(p.id)}>
                  <Icon name={p.icon} size={15} />
                  {p.title || 'Untitled'}
                </button>
                {p.id === node.primaryParentId ? (
                  <span className="tag">main</span>
                ) : (
                  <button className="btn-icon" onClick={() => removeParent(nodeId, p.id)} aria-label={`Remove link to ${p.title}`}>
                    <Icon name="x" size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="detail-section">
        <div className="section-head">
          <h3>Milestones</h3>
          {milestones.length ? (
            <span className="counter">
              {done}/{milestones.length}
            </span>
          ) : null}
        </div>
        <ul className="milestones">
          {milestones.map((m) => (
            <li key={m.id} data-done={m.done || undefined}>
              <button className="tick" onClick={() => toggleMilestone(m.id)} aria-pressed={m.done} aria-label={m.text}>
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                  <path d="M5 10.5 8.5 14 15 6.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="milestone-text">{m.text}</span>
              {m.doneAt ? <time>{formatDay(m.doneAt)}</time> : null}
              <button className="btn-icon row-action" onClick={() => deleteMilestone(m.id)} aria-label="Delete milestone">
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
        <AddInline placeholder="Add a milestone" onAdd={(text) => addMilestone(nodeId, text)} />
      </section>

      <section className="detail-section">
        <div className="section-head">
          <h3>Log</h3>
          <button className="btn btn-small" onClick={() => setLogging(true)}>
            Add entry
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="empty-note">Nothing logged yet. What did you actually do?</p>
        ) : (
          <ul className="entries">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryRow entryId={entry.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section detail-danger">
        <button
          className="btn btn-quiet"
          onClick={() => {
            const label = node.title || 'Untitled'
            deleteNode(nodeId)
            ui.select(null)
            ui.showToast(`Deleted “${label}”.${isRoot ? ' Its branches became roots.' : ' Its branches moved up.'}`, {
              label: 'Undo',
              run: applyUndo,
            })
          }}
        >
          <Icon name="trash" size={15} /> Delete node
        </button>
        <p className="hint">Anything below it moves up rather than being deleted with it.</p>
      </section>

      {logging ? <LogEntryForm nodeId={nodeId} onClose={() => setLogging(false)} /> : null}
    </Sheet>
  )
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')
  const submit = () => {
    if (!text.trim()) return
    onAdd(text.trim())
    setText('')
  }
  return (
    <div className="add-inline">
      <input
        className="field"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button className="btn-icon" onClick={submit} disabled={!text.trim()} aria-label="Add">
        <Icon name="plus" size={16} />
      </button>
    </div>
  )
}

function EntryRow({ entryId }: { entryId: string }) {
  const entry = useData((s) => s.graph.entries[entryId])
  const photos = useData((s) => s.graph.photos)
  const updateEntry = useData((s) => s.updateEntry)
  const deleteEntry = useData((s) => s.deleteEntry)
  const applyUndo = useData((s) => s.applyUndo)
  const showToast = useUI((s) => s.showToast)
  const [editing, setEditing] = useState(false)

  if (!entry) return null

  return (
    <div className="entry">
      <div className="entry-head">
        <input
          className="entry-date"
          type="date"
          value={entry.date.slice(0, 10)}
          onChange={(e) => updateEntry(entryId, { date: e.target.value })}
          aria-label="Date"
        />
        <button className="btn-icon row-action" onClick={() => setEditing((v) => !v)} aria-label="Edit note">
          <Icon name="pencil-simple" size={13} />
        </button>
        <button
          className="btn-icon row-action"
          onClick={() => {
            deleteEntry(entryId)
            showToast('Deleted a log entry.', { label: 'Undo', run: applyUndo })
          }}
          aria-label="Delete entry"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
      {editing ? (
        <textarea
          className="field"
          autoFocus
          rows={3}
          value={entry.note}
          onChange={(e) => updateEntry(entryId, { note: e.target.value })}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <p className="entry-note">{entry.note || <span className="text-faint">No note</span>}</p>
      )}
      {entry.photoIds.length ? (
        <div className="thumbs">
          {entry.photoIds.map((id) => {
            const photo = photos[id]
            return photo ? <PhotoThumb key={id} photo={photo} /> : null
          })}
        </div>
      ) : null}
    </div>
  )
}

function LogEntryForm({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const addEntry = useData((s) => s.addEntry)
  const updateEntry = useData((s) => s.updateEntry)
  const addPhoto = useData((s) => s.addPhoto)
  const user = useData((s) => s.user)
  const showToast = useUI((s) => s.showToast)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<Photo[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !user) return
    setBusy(true)
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const upload = await prepareUpload(file, backend.kind === 'supabase')
        const photo = await backend.uploadPhoto(user.id, upload)
        addPhoto(photo)
        setPending((p) => [...p, photo])
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That image could not be added.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Log an entry"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              const id = addEntry(nodeId, { date, note: note.trim() })
              if (pending.length) updateEntry(id, { photoIds: pending.map((p) => p.id) })
              onClose()
            }}
          >
            Save
          </button>
        </>
      }
    >
      <label className="labelled">
        <span>Date</span>
        <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <p className="hint">Backdate freely — this is when the thing happened, not when you typed it.</p>

      <textarea
        data-autofocus
        className="field"
        rows={4}
        placeholder="What happened?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <div className="thumbs">
        {pending.map((p) => (
          <PhotoThumb key={p.id} photo={p} />
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <button className="btn btn-small" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Icon name="image" size={15} /> {busy ? 'Adding…' : 'Add photos'}
      </button>
      <p className="hint">Photos are downscaled on this device before they are sent.</p>
    </Sheet>
  )
}

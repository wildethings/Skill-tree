import { useState } from 'react'
import { useData } from '../data/store'
import { useUI } from './uiStore'
import { backend } from '../data/backend'
import { downloadExport } from '../data/export'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

export function Settings() {
  const graph = useData((s) => s.graph)
  const index = useData((s) => s.index)
  const user = useData((s) => s.user)
  const sync = useData((s) => s.sync)
  const setPrefs = useData((s) => s.setPrefs)
  const moveRoot = useData((s) => s.moveRoot)
  const toggleCollapse = useData((s) => s.toggleCollapse)
  const signOut = useData((s) => s.signOut)
  const deleteAccount = useData((s) => s.deleteAccount)

  const ui = useUI()
  const [invites, setInvites] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <Sheet title="Settings" onClose={() => ui.openSettings(false)} wide>
      <section className="detail-section">
        <h3>Appearance</h3>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(['light', 'dark', 'system'] as const).map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={graph.prefs.theme === value}
              data-on={graph.prefs.theme === value || undefined}
              onClick={() => setPrefs({ theme: value })}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <h3>Root order</h3>
        <p className="hint">Roots that cross-link often are easiest to read side by side.</p>
        <ul className="root-order">
          {index.rootIds.map((id, i) => {
            const collapsed = graph.prefs.collapsedRootIds.includes(id)
            return (
              <li key={id}>
                <Icon name={graph.nodes[id].icon} size={16} />
                <span>{graph.nodes[id].title || 'Untitled'}</span>
                <button className="btn-icon" onClick={() => toggleCollapse(id)} aria-label={collapsed ? 'Expand' : 'Collapse'}>
                  <Icon name={collapsed ? 'arrows-out-simple' : 'arrows-in-simple'} size={14} />
                </button>
                <button className="btn-icon" onClick={() => moveRoot(id, -1)} disabled={i === 0} aria-label="Move left">
                  <Icon name="arrow-left" size={14} />
                </button>
                <button
                  className="btn-icon"
                  onClick={() => moveRoot(id, 1)}
                  disabled={i === index.rootIds.length - 1}
                  aria-label="Move right"
                >
                  <Icon name="arrow-right" size={14} />
                </button>
              </li>
            )
          })}
        </ul>
        {index.rootIds.length === 0 ? <p className="empty-note">No roots yet.</p> : null}
      </section>

      <section className="detail-section">
        <h3>Your data</h3>
        <p className="hint">
          {backend.kind === 'local'
            ? 'Local mode: everything lives in this browser on this device.'
            : sync.pending > 0
              ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync.`
              : 'Everything is synced.'}
        </p>
        <div className="button-row">
          <button className="btn" onClick={() => user && downloadExport(graph, user)}>
            <Icon name="download-simple" size={15} /> Export JSON
          </button>
          {backend.hasAccounts ? (
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  setInvites(await backend.createInvites(1))
                } catch (e) {
                  ui.showToast(e instanceof Error ? e.message : 'Could not create an invite.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Icon name="ticket" size={15} /> Create invite
            </button>
          ) : null}
        </div>
        {invites.length ? (
          <ul className="invite-list">
            {invites.map((code) => (
              <li key={code}>
                <code>{code}</code>
                <button className="btn btn-small" onClick={() => navigator.clipboard?.writeText(code)}>
                  Copy
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="detail-section detail-danger">
        <h3>Account</h3>
        {user ? <p className="hint">{user.email}</p> : null}
        <div className="button-row">
          {backend.hasAccounts ? (
            <button className="btn" onClick={signOut}>
              Sign out
            </button>
          ) : null}
          {confirming ? (
            <>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await deleteAccount()
                  ui.openSettings(false)
                }}
              >
                Delete everything, permanently
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button className="btn btn-quiet" onClick={() => setConfirming(true)}>
              <Icon name="trash" size={15} /> Delete account
            </button>
          )}
        </div>
        <p className="hint">Export first — deletion removes every node, entry and photo for good.</p>
      </section>
    </Sheet>
  )
}

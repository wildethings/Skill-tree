import { useState } from 'react'
import { useData } from '../data/store'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

/**
 * Offered once, when a graph built in local mode is found after signing in.
 * Declining is safe and reversible: the device copy is never deleted, whichever
 * way this goes, so the prompt can come back on the next sign-in.
 */
export function ImportPrompt() {
  const snapshot = useData((s) => s.pendingImport)
  const importing = useData((s) => s.importing)
  const importLocalGraph = useData((s) => s.importLocalGraph)
  const dismissImport = useData((s) => s.dismissImport)
  const [error, setError] = useState<string | null>(null)

  if (!snapshot) return null

  const counts = [
    `${snapshot.nodes} ${snapshot.nodes === 1 ? 'node' : 'nodes'}`,
    snapshot.entries ? `${snapshot.entries} log ${snapshot.entries === 1 ? 'entry' : 'entries'}` : null,
    snapshot.milestones ? `${snapshot.milestones} milestones` : null,
    snapshot.photos ? `${snapshot.photos} photos` : null,
  ].filter(Boolean)

  return (
    <Sheet
      title="There is a tree saved on this device"
      onClose={() => !importing && dismissImport()}
      footer={
        <>
          <button className="btn" disabled={importing} onClick={dismissImport}>
            Not now
          </button>
          <button
            className="btn btn-primary"
            data-autofocus
            disabled={importing}
            onClick={async () => {
              setError(null)
              const result = await importLocalGraph()
              if (!result.ok) setError(result.message)
            }}
          >
            {importing ? 'Uploading…' : 'Upload it to my account'}
          </button>
        </>
      }
    >
      <p className="hint">
        You built this before this device had an account, so it lives only in this browser. Uploading copies it into
        your account, where it syncs across devices.
      </p>

      <div className="import-summary">
        <span className="import-icon">
          <Icon name="tree" size={22} />
        </span>
        <div>
          <strong>{counts.join(' · ')}</strong>
          <em>Added alongside anything already in your account — nothing is replaced.</em>
        </div>
      </div>

      <p className="hint">
        The copy on this device is kept either way. It is not deleted, before or after uploading, so declining now
        costs nothing and you will be asked again next time you sign in.
      </p>

      {error ? <p className="auth-error">{error}</p> : null}
    </Sheet>
  )
}

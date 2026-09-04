import { useEffect } from 'react'
import { useData } from './data/store'
import { useUI } from './ui/uiStore'
import { useIconSprite, Icon } from './ui/Icon'
import { useTheme } from './ui/useTheme'
import { Canvas } from './canvas/Canvas'
import { Timeline } from './ui/Timeline'
import { Stats } from './ui/Stats'
import { NodeDetail } from './ui/NodeDetail'
import { AddNode } from './ui/AddNode'
import { Search } from './ui/Search'
import { Settings } from './ui/Settings'
import { Auth } from './ui/Auth'

export default function App() {
  const status = useData((s) => s.status)
  const error = useData((s) => s.error)
  const init = useData((s) => s.init)
  const ui = useUI()
  useIconSprite()
  useTheme()

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.('input, textarea')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        ui.openSearch(true)
      }
      if (e.key === 'Escape' && !typing) {
        if (ui.linkingFrom) ui.startLink(null)
        else if (ui.focusRootId) ui.focusRoot(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui])

  if (status === 'loading') return <div className="boot" role="status" aria-label="Loading" />
  if (status === 'signed-out' || status === 'needs-invite') return <Auth />
  if (status === 'error') {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>Could not load</h1>
          <p className="hint">{error}</p>
          <button className="btn btn-primary btn-block" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app" data-view={ui.view}>
      <TopBar />
      <main className="main">
        {ui.view === 'canvas' ? <Canvas /> : null}
        {ui.view === 'timeline' ? <Timeline /> : null}
        {ui.view === 'stats' ? <Stats /> : null}
      </main>

      {ui.view === 'canvas' ? <AddRootButton /> : null}
      {ui.selectedId ? <NodeDetail nodeId={ui.selectedId} /> : null}
      {ui.adding ? <AddNode intent={ui.adding} /> : null}
      {ui.searchOpen ? <Search /> : null}
      {ui.settingsOpen ? <Settings /> : null}
      {ui.linkingFrom ? <LinkingBar /> : null}
      <Toast />
      <SyncBadge />
    </div>
  )
}

function TopBar() {
  const ui = useUI()
  const focusTitle = useData((s) => (ui.focusRootId ? s.graph.nodes[ui.focusRootId]?.title : null))

  return (
    <header className="topbar">
      <nav className="tabs" aria-label="Views">
        {(['canvas', 'timeline', 'stats'] as const).map((view) => (
          <button key={view} data-on={ui.view === view || undefined} onClick={() => ui.setView(view)}>
            {view[0].toUpperCase() + view.slice(1)}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        {ui.focusRootId ? (
          <button className="chip chip-quiet focus-chip" onClick={() => ui.focusRoot(null)} aria-label="Leave focus mode">
            <Icon name="eye" size={14} />
            <span>{focusTitle || 'Focused'}</span>
            <Icon name="x" size={12} />
          </button>
        ) : null}
        <button className="btn-icon" onClick={() => ui.openSearch(true)} aria-label="Search" title="Search (⌘K)">
          <Icon name="magnifying-glass" size={17} />
        </button>
        <button className="btn-icon" onClick={() => ui.openSettings(true)} aria-label="Settings">
          <Icon name="gear-six" size={17} />
        </button>
      </div>
    </header>
  )
}

/** The mobile answer to long-press: a visible way to start a new root. */
function AddRootButton() {
  const startAdd = useUI((s) => s.startAdd)
  const hasNodes = useData((s) => s.index.live.length > 0)
  if (!hasNodes) return null
  return (
    <button className="fab" onClick={() => startAdd({ fromId: null, kind: 'root' })} aria-label="New root">
      <Icon name="plus" size={20} />
    </button>
  )
}

function LinkingBar() {
  const ui = useUI()
  const title = useData((s) => (ui.linkingFrom ? s.graph.nodes[ui.linkingFrom]?.title : ''))
  return (
    <div className="linking-bar" role="status">
      <span>
        Tap the node that <strong>{title || 'this'}</strong> also grows out of.
      </span>
      <button className="btn btn-small" onClick={() => ui.startLink(null)}>
        Cancel
      </button>
    </div>
  )
}

function Toast() {
  const toast = useUI((s) => s.toast)
  const dismiss = useUI((s) => s.dismissToast)
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.action ? (
        <button
          className="btn btn-small"
          onClick={() => {
            toast.action!.run()
            dismiss()
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button className="btn-icon" onClick={dismiss} aria-label="Dismiss">
        <Icon name="x" size={13} />
      </button>
    </div>
  )
}

function SyncBadge() {
  const sync = useData((s) => s.sync)
  if (sync.online && sync.pending === 0 && !sync.error) return null
  return (
    <div className="sync-badge" role="status">
      <Icon name={sync.online ? 'cloud-arrow-up' : 'cloud-slash'} size={14} />
      {sync.online ? `Saving ${sync.pending}…` : 'Offline — changes are queued'}
    </div>
  )
}

import { create } from 'zustand'

export type View = 'canvas' | 'timeline' | 'stats'
export type AddIntent = { fromId: string; kind: 'advance' | 'branch' } | { fromId: null; kind: 'root' }

type UIStore = {
  view: View
  /** Node whose detail card is open. */
  selectedId: string | null
  /** Root that focus mode is centred on. */
  focusRootId: string | null
  adding: AddIntent | null
  /** Node awaiting a second tap to receive a cross-link. */
  linkingFrom: string | null
  searchOpen: boolean
  query: string
  settingsOpen: boolean
  highlightIds: string[]
  toast: { text: string; action?: { label: string; run: () => void } } | null

  setView: (view: View) => void
  select: (id: string | null) => void
  focusRoot: (id: string | null) => void
  startAdd: (intent: AddIntent | null) => void
  startLink: (id: string | null) => void
  openSearch: (open: boolean) => void
  setQuery: (q: string) => void
  openSettings: (open: boolean) => void
  highlight: (ids: string[]) => void
  showToast: (text: string, action?: { label: string; run: () => void }) => void
  dismissToast: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useUI = create<UIStore>((set) => ({
  view: 'canvas',
  selectedId: null,
  focusRootId: null,
  adding: null,
  linkingFrom: null,
  searchOpen: false,
  query: '',
  settingsOpen: false,
  highlightIds: [],
  toast: null,

  setView: (view) => set({ view, selectedId: null, adding: null, linkingFrom: null }),
  select: (selectedId) => set({ selectedId, adding: null }),
  focusRoot: (focusRootId) => set({ focusRootId }),
  startAdd: (adding) => set({ adding, linkingFrom: null }),
  startLink: (linkingFrom) => set({ linkingFrom, selectedId: null }),
  openSearch: (searchOpen) => set({ searchOpen, query: searchOpen ? '' : '' }),
  setQuery: (query) => set({ query }),
  openSettings: (settingsOpen) => set({ settingsOpen }),
  highlight: (highlightIds) => set({ highlightIds }),

  showToast: (text, action) => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: { text, action } })
    toastTimer = setTimeout(() => set({ toast: null }), 7000)
  },
  dismissToast: () => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: null })
  },
}))

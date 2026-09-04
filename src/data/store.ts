import { create } from 'zustand'
import { emptyGraph, type Graph, type LogEntry, type Milestone, type NodeState, type Photo, type Preferences, type SkillNode, type User } from '../types'
import { newId, now, today } from '../lib/id'
import { buildIndex, milestonesOf, validateParents, type GraphIndex } from '../lib/graph/graph'
import { defaultBaseColor } from '../lib/color/palette'
import { backend } from './backend'
import { createSyncer, type SyncState } from './sync'
import type { Row } from './adapter'

type Status = 'loading' | 'signed-out' | 'needs-invite' | 'ready' | 'error'

/** A mutation's before-state, so it can be put back exactly. */
type Undo = { label: string; rows: Row[] }

type DataStore = {
  status: Status
  user: User | null
  pendingEmail: string
  graph: Graph
  index: GraphIndex
  sync: SyncState
  error: string | null
  undo: Undo | null

  init: () => Promise<void>
  signIn: (email: string) => Promise<string>
  redeemInvite: (code: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>

  createRoot: (fields?: Partial<Pick<SkillNode, 'title' | 'icon' | 'baseColor' | 'state'>>) => string
  addNode: (fromId: string, kind: 'advance' | 'branch', fields?: Partial<SkillNode>) => string | null
  updateNode: (id: string, patch: Partial<SkillNode>) => void
  setState: (id: string, state: NodeState) => void
  nudgeNode: (id: string, offset: { dx: number; dy: number }) => void
  resetOffset: (id: string) => void
  deleteNode: (id: string) => void
  reparent: (id: string, newParentId: string) => string | null
  addCrossLink: (id: string, parentId: string) => string | null
  removeParent: (id: string, parentId: string) => void

  addMilestone: (nodeId: string, text: string) => void
  updateMilestone: (id: string, patch: Partial<Milestone>) => void
  toggleMilestone: (id: string) => void
  deleteMilestone: (id: string) => void

  addEntry: (nodeId: string, fields?: Partial<LogEntry>) => string
  updateEntry: (id: string, patch: Partial<LogEntry>) => void
  deleteEntry: (id: string) => void
  addPhoto: (photo: Photo) => void

  setPrefs: (patch: Partial<Preferences>) => void
  moveRoot: (id: string, direction: -1 | 1) => void
  toggleCollapse: (rootId: string) => void

  applyUndo: () => void
  clearUndo: () => void
}

let syncer: ReturnType<typeof createSyncer> | null = null

export const useData = create<DataStore>((set, get) => {
  /** Applies a mutation to a cloned graph, reindexes, and queues the changed rows. */
  const commit = (label: string | null, mutate: (g: Graph) => Row[]) => {
    const before = get().graph
    const graph = structuredClone(before)
    const rows = mutate(graph)
    if (rows.length === 0) return
    const undo: Undo | null = label ? { label, rows: snapshot(before, rows) } : null
    set({ graph, index: buildIndex(graph), undo })
    syncer?.enqueue(rows, graph)
  }

  /** The prior version of every row a mutation is about to touch. */
  const snapshot = (graph: Graph, rows: Row[]): Row[] => {
    const out: Row[] = []
    for (const row of rows) {
      switch (row.table) {
        case 'nodes': {
          const prev = graph.nodes[row.data.id]
          out.push(prev ? { table: 'nodes', data: structuredClone(prev) } : { table: 'nodes', data: { ...row.data, deletedAt: now() } })
          break
        }
        case 'milestones': {
          const prev = graph.milestones[row.data.id]
          out.push(prev ? { table: 'milestones', data: structuredClone(prev) } : { table: 'milestones', data: { ...row.data, deletedAt: now() } })
          break
        }
        case 'entries': {
          const prev = graph.entries[row.data.id]
          out.push(prev ? { table: 'entries', data: structuredClone(prev) } : { table: 'entries', data: { ...row.data, deletedAt: now() } })
          break
        }
        case 'prefs':
          out.push({ table: 'prefs', data: structuredClone(graph.prefs) })
          break
        default:
          break
      }
    }
    return out
  }

  const touchNode = (graph: Graph, id: string, patch: Partial<SkillNode>): Row => {
    const node = { ...graph.nodes[id], ...patch, updatedAt: now() }
    graph.nodes[id] = node
    return { table: 'nodes', data: node }
  }

  const touchPrefs = (graph: Graph, patch: Partial<Preferences>): Row => {
    graph.prefs = { ...graph.prefs, ...patch, updatedAt: now() }
    return { table: 'prefs', data: graph.prefs }
  }

  return {
    status: 'loading',
    user: null,
    pendingEmail: '',
    graph: emptyGraph(''),
    index: buildIndex(emptyGraph('')),
    sync: { pending: 0, online: true, error: null },
    error: null,
    undo: null,

    async init() {
      try {
        const session = await backend.session()
        if (session.state === 'signed-out') return set({ status: 'signed-out' })
        if (session.state === 'needs-invite') return set({ status: 'needs-invite', pendingEmail: session.email })

        const user = session.user
        syncer = createSyncer(backend, (sync) => set({ sync }))
        syncer.listen()
        const { graph: cached, fresh } = await syncer.start(user.id)
        if (cached) set({ status: 'ready', user, graph: cached, index: buildIndex(cached) })
        const graph = await fresh
        // Anything queued locally is newer than what just arrived, so replay it.
        set({ status: 'ready', user, graph, index: buildIndex(graph) })
        await syncer.flushNow()
      } catch (e) {
        set({ status: 'error', error: e instanceof Error ? e.message : 'Something went wrong.' })
      }
    },

    async signIn(email) {
      const { message } = await backend.signIn(email)
      return message
    },

    async redeemInvite(code, displayName) {
      await backend.redeemInvite(code, displayName)
      set({ status: 'loading' })
      await get().init()
    },

    async signOut() {
      await backend.signOut()
      syncer = null
      set({ status: 'signed-out', user: null, graph: emptyGraph(''), index: buildIndex(emptyGraph('')) })
    },

    async deleteAccount() {
      await backend.deleteAccount()
      syncer = null
      set({ status: 'signed-out', user: null, graph: emptyGraph(''), index: buildIndex(emptyGraph('')) })
    },

    /* ------------------------------------------------------------- nodes -- */

    createRoot(fields = {}) {
      const id = newId()
      const userId = get().user?.id ?? ''
      const used = get().index.rootIds.map((r) => get().graph.nodes[r].baseColor ?? '')
      commit(null, (graph) => {
        const node: SkillNode = {
          id,
          userId,
          title: fields.title ?? '',
          icon: fields.icon ?? 'sparkle',
          parentIds: [],
          primaryParentId: null,
          baseColor: fields.baseColor ?? defaultBaseColor(used),
          state: fields.state ?? 'started',
          offset: { dx: 0, dy: 0 },
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null,
        }
        graph.nodes[id] = node
        return [
          { table: 'nodes', data: node },
          touchPrefs(graph, { rootOrder: [...graph.prefs.rootOrder, id] }),
        ]
      })
      return id
    },

    /**
     * Advance grows the same skill onward: a child of this node.
     * Branch grows a new skill beside it: a child of this node's own parent.
     * On a root the two coincide — a root's siblings are other roots, which are
     * created outright rather than branched into.
     */
    addNode(fromId, kind, fields = {}) {
      const from = get().graph.nodes[fromId]
      if (!from) return null
      const parentId = kind === 'advance' ? fromId : (from.primaryParentId ?? fromId)
      const id = newId()
      const userId = get().user?.id ?? ''
      commit(null, (graph) => {
        const node: SkillNode = {
          id,
          userId,
          title: fields.title ?? '',
          icon: fields.icon ?? graph.nodes[parentId].icon,
          parentIds: [parentId],
          primaryParentId: parentId,
          baseColor: null, // every non-root derives its tint
          state: fields.state ?? 'started',
          offset: { dx: 0, dy: 0 },
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null,
        }
        graph.nodes[id] = node
        return [{ table: 'nodes', data: node }]
      })
      return id
    },

    updateNode(id, patch) {
      commit(null, (graph) => (graph.nodes[id] ? [touchNode(graph, id, patch)] : []))
    },

    setState(id, state) {
      commit(null, (graph) => (graph.nodes[id] ? [touchNode(graph, id, { state })] : []))
    },

    nudgeNode(id, offset) {
      commit(null, (graph) => (graph.nodes[id] ? [touchNode(graph, id, { offset })] : []))
    },

    resetOffset(id) {
      commit(null, (graph) => (graph.nodes[id] ? [touchNode(graph, id, { offset: { dx: 0, dy: 0 } })] : []))
    },

    /**
     * Soft delete. Children are re-parented to this node's primary parent
     * rather than deleted with it; children of a deleted root become roots and
     * carry its colour on, so the branch keeps its identity.
     */
    deleteNode(id) {
      const graph = get().graph
      const node = graph.nodes[id]
      if (!node) return
      const heir = node.primaryParentId
      const wasRoot = node.parentIds.length === 0

      commit(`Deleted “${node.title || 'Untitled'}”`, (g) => {
        const rows: Row[] = [touchNode(g, id, { deletedAt: now() })]
        const rootOrder = g.prefs.rootOrder.filter((r) => r !== id)

        for (const child of Object.values(g.nodes)) {
          if (child.deletedAt || !child.parentIds.includes(id)) continue
          const kept = child.parentIds.filter((p) => p !== id)
          if (heir && heir !== child.id && !kept.includes(heir)) kept.push(heir)

          if (kept.length === 0) {
            // Promoted to a root by the deletion, not by the user.
            rows.push(
              touchNode(g, child.id, {
                parentIds: [],
                primaryParentId: null,
                baseColor: child.baseColor ?? node.baseColor ?? defaultBaseColor([]),
              }),
            )
            rootOrder.push(child.id)
          } else {
            const primary = child.primaryParentId === id ? (heir ?? kept[0]) : child.primaryParentId
            rows.push(touchNode(g, child.id, { parentIds: kept, primaryParentId: primary }))
          }
        }

        if (wasRoot || rootOrder.length !== g.prefs.rootOrder.length) {
          rows.push(
            touchPrefs(g, {
              rootOrder,
              collapsedRootIds: g.prefs.collapsedRootIds.filter((r) => r !== id),
            }),
          )
        }
        return rows
      })
    },

    /** Moves a node under a new primary parent. Returns an error message, or null. */
    reparent(id, newParentId) {
      const graph = get().graph
      const node = graph.nodes[id]
      if (!node || id === newParentId) return null
      const parentIds = [newParentId, ...node.parentIds.filter((p) => p !== node.primaryParentId && p !== newParentId)]
      const check = validateParents(graph, id, parentIds, newParentId)
      if (!check.ok) return check.message

      commit(`Moved “${node.title || 'Untitled'}”`, (g) => {
        const rows = [touchNode(g, id, { parentIds, primaryParentId: newParentId, baseColor: null, offset: { dx: 0, dy: 0 } })]
        if (node.parentIds.length === 0) {
          rows.push(touchPrefs(g, { rootOrder: g.prefs.rootOrder.filter((r) => r !== id) }))
        }
        return rows
      })
      return null
    },

    addCrossLink(id, parentId) {
      const graph = get().graph
      const node = graph.nodes[id]
      if (!node || node.parentIds.includes(parentId) || id === parentId) return null
      if (node.parentIds.length === 0) return 'A root has nothing above it. Move it under a parent first.'
      const parentIds = [...node.parentIds, parentId]
      const check = validateParents(graph, id, parentIds, node.primaryParentId)
      if (!check.ok) return check.message
      commit(null, (g) => [touchNode(g, id, { parentIds })])
      return null
    },

    removeParent(id, parentId) {
      const node = get().graph.nodes[id]
      if (!node || node.primaryParentId === parentId) return
      commit(null, (g) => [touchNode(g, id, { parentIds: node.parentIds.filter((p) => p !== parentId) })])
    },

    /* -------------------------------------------------------- milestones -- */

    addMilestone(nodeId, text) {
      const order = milestonesOf(get().graph, nodeId).length
      commit(null, (graph) => {
        const m: Milestone = {
          id: newId(),
          nodeId,
          text,
          done: false,
          doneAt: null,
          order,
          updatedAt: now(),
          deletedAt: null,
        }
        graph.milestones[m.id] = m
        return [{ table: 'milestones', data: m }]
      })
    },

    updateMilestone(id, patch) {
      commit(null, (graph) => {
        if (!graph.milestones[id]) return []
        const m = { ...graph.milestones[id], ...patch, updatedAt: now() }
        graph.milestones[id] = m
        return [{ table: 'milestones', data: m }]
      })
    },

    toggleMilestone(id) {
      const m = get().graph.milestones[id]
      if (!m) return
      get().updateMilestone(id, { done: !m.done, doneAt: m.done ? null : now() })
    },

    deleteMilestone(id) {
      const m = get().graph.milestones[id]
      if (!m) return
      commit(`Deleted “${m.text || 'milestone'}”`, (graph) => {
        const next = { ...graph.milestones[id], deletedAt: now(), updatedAt: now() }
        graph.milestones[id] = next
        return [{ table: 'milestones', data: next }]
      })
    },

    /* ------------------------------------------------------------ log -- */

    addEntry(nodeId, fields = {}) {
      const id = newId()
      commit(null, (graph) => {
        const e: LogEntry = {
          id,
          nodeId,
          date: fields.date ?? today(),
          note: fields.note ?? '',
          photoIds: fields.photoIds ?? [],
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null,
        }
        graph.entries[id] = e
        return [{ table: 'entries', data: e }]
      })
      return id
    },

    updateEntry(id, patch) {
      commit(null, (graph) => {
        if (!graph.entries[id]) return []
        const e = { ...graph.entries[id], ...patch, updatedAt: now() }
        graph.entries[id] = e
        return [{ table: 'entries', data: e }]
      })
    },

    deleteEntry(id) {
      const e = get().graph.entries[id]
      if (!e) return
      commit('Deleted a log entry', (graph) => {
        const next = { ...graph.entries[id], deletedAt: now(), updatedAt: now() }
        graph.entries[id] = next
        return [{ table: 'entries', data: next }]
      })
    },

    addPhoto(photo) {
      commit(null, (graph) => {
        graph.photos[photo.id] = photo
        return [{ table: 'photos', data: photo }]
      })
    },

    /* ------------------------------------------------------ preferences -- */

    setPrefs(patch) {
      commit(null, (graph) => [touchPrefs(graph, patch)])
    },

    moveRoot(id, direction) {
      const order = [...get().index.rootIds]
      const from = order.indexOf(id)
      const to = from + direction
      if (from === -1 || to < 0 || to >= order.length) return
      order.splice(to, 0, ...order.splice(from, 1))
      commit(null, (graph) => [touchPrefs(graph, { rootOrder: order })])
    },

    toggleCollapse(rootId) {
      const current = get().graph.prefs.collapsedRootIds
      const next = current.includes(rootId) ? current.filter((r) => r !== rootId) : [...current, rootId]
      commit(null, (graph) => [touchPrefs(graph, { collapsedRootIds: next })])
    },

    /* ------------------------------------------------------------- undo -- */

    applyUndo() {
      const undo = get().undo
      if (!undo) return
      commit(null, (graph) => {
        const rows: Row[] = []
        for (const row of undo.rows) {
          switch (row.table) {
            case 'nodes':
              graph.nodes[row.data.id] = { ...row.data, updatedAt: now() }
              rows.push({ table: 'nodes', data: graph.nodes[row.data.id] })
              break
            case 'milestones':
              graph.milestones[row.data.id] = { ...row.data, updatedAt: now() }
              rows.push({ table: 'milestones', data: graph.milestones[row.data.id] })
              break
            case 'entries':
              graph.entries[row.data.id] = { ...row.data, updatedAt: now() }
              rows.push({ table: 'entries', data: graph.entries[row.data.id] })
              break
            case 'prefs':
              graph.prefs = { ...row.data, updatedAt: now() }
              rows.push({ table: 'prefs', data: graph.prefs })
              break
            default:
              break
          }
        }
        return rows
      })
      set({ undo: null })
    },

    clearUndo: () => set({ undo: null }),
  }
})

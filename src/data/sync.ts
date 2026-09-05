import type { Graph } from '../types'
import type { Backend, Row } from './adapter'
import { idbAvailable, kvGet, kvSet, outboxAll, outboxClear, outboxPut } from './idb'

const cacheKey = (userId: string) => `cache:graph:${userId}`

export type SyncState = { pending: number; online: boolean; error: string | null }

/**
 * Wraps a Backend with a local cache and a durable outbox.
 *
 * Writes are applied to the store optimistically and handed here; if the push
 * fails the rows sit in IndexedDB until the next flush, so a dropped connection
 * costs nothing. Conflicts are resolved by the backend on updatedAt.
 */
export function createSyncer(backend: Backend, onState: (s: SyncState) => void) {
  let pending: Row[] = []
  let flushing = false
  let error: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let userId = ''

  const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
  const emit = () => onState({ pending: pending.length, online: online(), error })

  async function persistOutbox() {
    if (!idbAvailable()) return
    try {
      await outboxClear()
      if (pending.length) await outboxPut({ userId, rows: pending })
    } catch {
      /* the outbox is a convenience; losing it must never break a write */
    }
  }

  async function flush(): Promise<void> {
    if (flushing || pending.length === 0) return
    if (!online()) {
      emit()
      return
    }
    flushing = true
    const batch = pending
    pending = []
    emit()
    try {
      await backend.push(userId, batch)
      error = null
      await persistOutbox()
    } catch (e) {
      // Put the batch back in front of anything queued while we were away.
      pending = [...batch, ...pending]
      error = e instanceof Error ? e.message : 'Could not save.'
      await persistOutbox()
      schedule(4000)
    } finally {
      flushing = false
      emit()
    }
  }

  function schedule(delay = 400) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, delay)
  }

  return {
    async start(id: string): Promise<{ graph: Graph | null; fresh: Promise<Graph> }> {
      userId = id
      if (idbAvailable()) {
        try {
          const queued = (await outboxAll()) as Array<{ userId: string; rows: Row[] }>
          for (const q of queued) if (q.userId === id) pending.push(...q.rows)
        } catch {
          /* ignore a corrupt outbox */
        }
      }
      // Serve the cached graph first so the canvas paints immediately, then
      // reconcile against the server.
      const cached = idbAvailable() ? ((await kvGet<Graph>(cacheKey(id))) ?? null) : null
      const fresh = backend
        .load(id)
        .then(async (g) => {
          if (idbAvailable()) await kvSet(cacheKey(id), g)
          return g
        })
        .catch((e) => {
          error = e instanceof Error ? e.message : 'Could not load.'
          emit()
          if (cached) return cached
          throw e
        })
      void flush()
      emit()
      return { graph: cached, fresh }
    },

    /** Queue rows and cache the new graph. Never throws — writes stay local. */
    enqueue(rows: Row[], graph: Graph) {
      pending.push(...rows)
      emit()
      void persistOutbox()
      if (idbAvailable()) void kvSet(cacheKey(userId), graph).catch(() => {})
      schedule()
    },

    flushNow: flush,

    listen() {
      const go = () => void flush()
      window.addEventListener('online', go)
      // A tab going away is the last chance to get queued writes out.
      const onHide = () => {
        if (document.visibilityState === 'hidden') void flush()
      }
      document.addEventListener('visibilitychange', onHide)
      return () => {
        window.removeEventListener('online', go)
        document.removeEventListener('visibilitychange', onHide)
      }
    },
  }
}

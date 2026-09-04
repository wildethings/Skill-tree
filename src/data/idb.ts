/** Minimal promise wrapper over IndexedDB. Two stores: records and the outbox. */
const DB = 'skill-tree'
const VERSION = 1

let handle: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  handle ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return handle
}

const run = <T,>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )

export const kvGet = <T,>(key: string): Promise<T | undefined> => run('kv', 'readonly', (s) => s.get(key))
export const kvSet = (key: string, value: unknown): Promise<unknown> =>
  run('kv', 'readwrite', (s) => s.put(value, key))
export const kvDelete = (key: string): Promise<unknown> => run('kv', 'readwrite', (s) => s.delete(key))

export const outboxAll = (): Promise<unknown[]> => run('outbox', 'readonly', (s) => s.getAll())
export const outboxPut = (value: unknown): Promise<unknown> => run('outbox', 'readwrite', (s) => s.add(value))
export const outboxClear = (): Promise<unknown> => run('outbox', 'readwrite', (s) => s.clear())

export const idbAvailable = (): boolean => typeof indexedDB !== 'undefined'

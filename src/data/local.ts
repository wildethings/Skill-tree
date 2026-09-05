import { emptyGraph, type Graph, type Photo, type User } from '../types'
import { newId, now } from '../lib/id'
import type { Backend, PhotoUpload, Row } from './adapter'
import { kvDelete, kvGet, kvSet } from './idb'

const USER_KEY = 'local:user'
const graphKey = (userId: string) => `local:graph:${userId}`

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })

/**
 * Local mode: no account, no network, everything in IndexedDB on this device.
 * It exists so the app is usable — and reviewable — without a Supabase project,
 * and it implements the same Backend contract so nothing above it changes.
 */
export function createLocalBackend(): Backend {
  let cached: Graph | null = null

  const read = async (userId: string): Promise<Graph> => {
    cached ??= (await kvGet<Graph>(graphKey(userId))) ?? emptyGraph(userId)
    return cached
  }
  const write = async (userId: string) => {
    if (cached) await kvSet(graphKey(userId), cached)
  }

  return {
    kind: 'local',
    hasAccounts: false,

    async session() {
      const user = await kvGet<User>(USER_KEY)
      if (user) return { state: 'ready' as const, user }
      const fresh: User = {
        id: newId(),
        email: 'local@device',
        displayName: '',
        createdAt: now(),
      }
      await kvSet(USER_KEY, fresh)
      return { state: 'ready' as const, user: fresh }
    },
    onAuthChange() {
      return () => {}
    },
    async signIn() {
      return { message: 'Local mode keeps everything on this device.' }
    },
    async redeemInvite(_code, displayName) {
      const user = (await kvGet<User>(USER_KEY))!
      const updated = { ...user, displayName }
      await kvSet(USER_KEY, updated)
      return updated
    },
    async signOut() {},
    async deleteAccount() {
      const user = await kvGet<User>(USER_KEY)
      if (user) await kvDelete(graphKey(user.id))
      await kvDelete(USER_KEY)
      cached = null
    },
    async createInvites() {
      return []
    },

    async signPhotoUrls(paths) {
      // Local photos are inlined data URLs; there is nothing to sign.
      return Object.fromEntries(paths.map((p) => [p, p]))
    },

    async load(userId) {
      return structuredClone(await read(userId))
    },

    async push(userId: string, rows: Row[]) {
      if (rows.length === 0) return
      const graph = await read(userId)
      for (const row of rows) {
        switch (row.table) {
          case 'nodes':
            graph.nodes[row.data.id] = row.data
            break
          case 'milestones':
            graph.milestones[row.data.id] = row.data
            break
          case 'entries':
            graph.entries[row.data.id] = row.data
            break
          case 'photos':
            graph.photos[row.data.id] = row.data
            break
          case 'prefs':
            graph.prefs = row.data
            break
        }
      }
      await write(userId)
    },

    async uploadPhoto(userId, upload: PhotoUpload) {
      // No object storage here, so the thumbnail is inlined. Full-size versions
      // are not kept locally — they would bloat the device store for no gain.
      const photo: Photo = {
        id: newId(),
        userId,
        url: await blobToDataUrl(upload.thumb),
        fullUrl: null,
        width: upload.width,
        height: upload.height,
        createdAt: now(),
      }
      return photo
    },
  }
}

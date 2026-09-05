import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { emptyGraph, type LogEntry, type Milestone, type Photo, type Preferences, type SkillNode } from '../types'
import { newId, now } from '../lib/id'
import type { Backend, PhotoUpload, Row, Session } from './adapter'

export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}
export const supabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey)

/* ------------------------------------------------------------ row mapping -- */
/* The database is snake_case and carries user_id on every row (isolation is
   enforced there, not here); the client model is camelCase. */

const nodeFromRow = (r: Record<string, any>): SkillNode => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  icon: r.icon,
  parentIds: r.parent_ids ?? [],
  primaryParentId: r.primary_parent_id,
  baseColor: r.base_color,
  state: r.state,
  offset: { dx: r.offset_dx ?? 0, dy: r.offset_dy ?? 0 },
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
})

const milestoneFromRow = (r: Record<string, any>): Milestone => ({
  id: r.id,
  nodeId: r.node_id,
  text: r.text,
  done: r.done,
  doneAt: r.done_at,
  order: r.order,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
})

const entryFromRow = (r: Record<string, any>): LogEntry => ({
  id: r.id,
  nodeId: r.node_id,
  date: r.date,
  note: r.note,
  photoIds: r.photo_ids ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
})

const photoFromRow = (r: Record<string, any>): Photo => ({
  id: r.id,
  userId: r.user_id,
  url: r.url,
  fullUrl: r.full_url,
  width: r.width,
  height: r.height,
  createdAt: r.created_at,
})

const prefsFromRow = (r: Record<string, any>, userId: string): Preferences => ({
  userId,
  rootOrder: r.root_order ?? [],
  collapsedRootIds: r.collapsed_root_ids ?? [],
  hiddenStatIds: r.hidden_stat_ids ?? [],
  statOrder: r.stat_order ?? [],
  theme: r.theme ?? 'system',
  countPlannedInStats: r.count_planned_in_stats ?? true,
  updatedAt: r.updated_at,
})

/** Shapes a row for sync_push(), which resolves last-write-wins server-side. */
function toPayload(userId: string, row: Row): Record<string, unknown> {
  switch (row.table) {
    case 'nodes': {
      const n = row.data
      return {
        _table: 'nodes', user_id: userId, id: n.id, title: n.title, icon: n.icon,
        parent_ids: n.parentIds, primary_parent_id: n.primaryParentId, base_color: n.baseColor,
        state: n.state, offset_dx: n.offset.dx, offset_dy: n.offset.dy,
        created_at: n.createdAt, updated_at: n.updatedAt, deleted_at: n.deletedAt,
      }
    }
    case 'milestones': {
      const m = row.data
      return {
        _table: 'milestones', user_id: userId, id: m.id, node_id: m.nodeId, text: m.text,
        done: m.done, done_at: m.doneAt, order: m.order, updated_at: m.updatedAt, deleted_at: m.deletedAt,
      }
    }
    case 'entries': {
      const e = row.data
      return {
        _table: 'log_entries', user_id: userId, id: e.id, node_id: e.nodeId, date: e.date,
        note: e.note, photo_ids: e.photoIds, created_at: e.createdAt, updated_at: e.updatedAt,
        deleted_at: e.deletedAt,
      }
    }
    case 'photos': {
      const p = row.data
      return {
        _table: 'photos', user_id: userId, id: p.id, url: p.url, full_url: p.fullUrl,
        width: p.width, height: p.height, created_at: p.createdAt,
      }
    }
    case 'prefs': {
      const p = row.data
      return {
        _table: 'preferences', user_id: userId, root_order: p.rootOrder,
        collapsed_root_ids: p.collapsedRootIds, hidden_stat_ids: p.hiddenStatIds,
        stat_order: p.statOrder, theme: p.theme, count_planned_in_stats: p.countPlannedInStats,
        updated_at: p.updatedAt,
      }
    }
  }
}

export function createSupabaseBackend(): Backend {
  const client: SupabaseClient = createClient(supabaseConfig.url!, supabaseConfig.anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

  return {
    kind: 'supabase',
    hasAccounts: true,

    async session(): Promise<Session> {
      const { data } = await client.auth.getSession()
      const authUser = data.session?.user
      if (!authUser) return { state: 'signed-out' }

      // Authenticated is not admitted: without a profile row every policy
      // denies, so the app asks for an invite code instead of loading.
      const { data: profile } = await client
        .from('profiles')
        .select('id, email, display_name, created_at')
        .eq('id', authUser.id)
        .maybeSingle()

      if (!profile) return { state: 'needs-invite', email: authUser.email ?? '' }
      return {
        state: 'ready',
        user: {
          id: profile.id,
          email: profile.email,
          displayName: profile.display_name,
          createdAt: profile.created_at,
        },
      }
    },

    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange(() => cb())
      return () => data.subscription.unsubscribe()
    },

    async signIn(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw new Error(error.message)
      return { message: `Check ${email} for a sign-in link.` }
    },

    async redeemInvite(code, displayName) {
      const { data, error } = await client.rpc('redeem_invite', { invite_code: code, display_name: displayName })
      if (error) throw new Error(error.message)
      const row = Array.isArray(data) ? data[0] : data
      return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at }
    },

    async signOut() {
      await client.auth.signOut()
    },

    async deleteAccount() {
      const { error } = await client.rpc('delete_account')
      if (error) throw new Error(error.message)
      await client.auth.signOut()
    },

    async createInvites(count) {
      const { data, error } = await client.rpc('create_invite', { count })
      if (error) throw new Error(error.message)
      return (data as unknown[] as string[]) ?? []
    },

    async load(userId) {
      const graph = emptyGraph(userId)
      const [nodes, milestones, entries, photos, prefs] = await Promise.all([
        client.from('nodes').select('*').eq('user_id', userId),
        client.from('milestones').select('*').eq('user_id', userId),
        client.from('log_entries').select('*').eq('user_id', userId),
        client.from('photos').select('*').eq('user_id', userId),
        client.from('preferences').select('*').eq('user_id', userId).maybeSingle(),
      ])
      const failed = [nodes, milestones, entries, photos, prefs].find((r) => r.error)
      if (failed?.error) throw new Error(failed.error.message)

      for (const r of nodes.data ?? []) graph.nodes[r.id] = nodeFromRow(r)
      for (const r of milestones.data ?? []) graph.milestones[r.id] = milestoneFromRow(r)
      for (const r of entries.data ?? []) graph.entries[r.id] = entryFromRow(r)
      for (const r of photos.data ?? []) graph.photos[r.id] = photoFromRow(r)
      if (prefs.data) graph.prefs = prefsFromRow(prefs.data, userId)
      return graph
    },

    async push(userId, rows) {
      if (rows.length === 0) return
      const { error } = await client.rpc('sync_push', { rows: rows.map((r) => toPayload(userId, r)) })
      if (error) throw new Error(error.message)
    },

    async uploadPhoto(userId, upload: PhotoUpload) {
      const id = newId()
      const put = async (blob: Blob, suffix: string) => {
        const path = `${userId}/${id}-${suffix}.jpg`
        const { error } = await client.storage.from('photos').upload(path, blob, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
        })
        if (error) throw new Error(error.message)
        return client.storage.from('photos').getPublicUrl(path).data.publicUrl
      }
      const url = await put(upload.thumb, 'thumb')
      const fullUrl = upload.full ? await put(upload.full, 'full') : null
      return { id, userId, url, fullUrl, width: upload.width, height: upload.height, createdAt: now() }
    },
  }
}


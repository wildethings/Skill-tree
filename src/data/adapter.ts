import type { Graph, LogEntry, Milestone, Photo, Preferences, SkillNode, User } from '../types'

export type Row =
  | { table: 'nodes'; data: SkillNode }
  | { table: 'milestones'; data: Milestone }
  | { table: 'entries'; data: LogEntry }
  | { table: 'photos'; data: Photo }
  | { table: 'prefs'; data: Preferences }

export type Session =
  /** No account. */
  | { state: 'signed-out' }
  /** Authenticated but not yet admitted — needs an invite code. */
  | { state: 'needs-invite'; email: string }
  | { state: 'ready'; user: User }

export type PhotoUpload = { thumb: Blob; full: Blob | null; width: number; height: number }

/**
 * Everything persistence-shaped sits behind this. Two implementations ship:
 * Supabase, and a local one that keeps the same graph in IndexedDB on one
 * device. Mutations are row-shaped so the outbox in sync.ts can queue them
 * without knowing anything about the model.
 */
export interface Backend {
  readonly kind: 'local' | 'supabase'
  /** Whether this backend can hand out invite codes and sign out. */
  readonly hasAccounts: boolean

  session(): Promise<Session>
  onAuthChange(cb: () => void): () => void
  signIn(email: string): Promise<{ message: string }>
  redeemInvite(code: string, displayName: string): Promise<User>
  signOut(): Promise<void>
  deleteAccount(): Promise<void>
  createInvites(count: number): Promise<string[]>

  load(userId: string): Promise<Graph>
  push(userId: string, rows: Row[]): Promise<void>
  uploadPhoto(userId: string, upload: PhotoUpload): Promise<Photo>
}

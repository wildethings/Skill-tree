export type ISODate = string

export type User = {
  id: string
  email: string
  displayName: string
  createdAt: ISODate
}

export type NodeState = 'planned' | 'started'

export type SkillNode = {
  id: string
  userId: string
  title: string
  /** Phosphor icon name, e.g. "diamond". */
  icon: string
  /** Empty array = this is a root. Multiple entries = a cross-linked node. */
  parentIds: string[]
  /** Drives colour inheritance and layout position. One of parentIds, or null for roots. */
  primaryParentId: string | null
  /** OKLCH string. Roots only; null on every other node — non-roots derive their tint. */
  baseColor: string | null
  state: NodeState
  /** Manual nudge applied on top of the auto-layout position. Never an absolute position. */
  offset: { dx: number; dy: number }
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt: ISODate | null
}

export type Milestone = {
  id: string
  nodeId: string
  text: string
  done: boolean
  doneAt: ISODate | null
  order: number
  updatedAt: ISODate
  deletedAt: ISODate | null
}

export type LogEntry = {
  id: string
  nodeId: string
  /** The date the thing happened. User-editable, deliberately not createdAt. */
  date: ISODate
  note: string
  photoIds: string[]
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt: ISODate | null
}

export type Photo = {
  id: string
  userId: string
  /** Thumbnail, ~400px on the long edge. */
  url: string
  fullUrl: string | null
  width: number
  height: number
  createdAt: ISODate
}

/** Per-user view state. Not part of the graph, but persisted and synced alongside it. */
export type Preferences = {
  userId: string
  /** User-controlled left-to-right order of roots on the canvas. */
  rootOrder: string[]
  collapsedRootIds: string[]
  hiddenStatIds: string[]
  statOrder: string[]
  theme: 'light' | 'dark' | 'system'
  /** Whether `planned` nodes are counted in stats. See docs/DECISIONS.md. */
  countPlannedInStats: boolean
  updatedAt: ISODate
}

/** The whole of a user's data, held in client state and fetched whole on load. */
export type Graph = {
  nodes: Record<string, SkillNode>
  milestones: Record<string, Milestone>
  entries: Record<string, LogEntry>
  photos: Record<string, Photo>
  prefs: Preferences
}

export const emptyGraph = (userId: string): Graph => ({
  nodes: {},
  milestones: {},
  entries: {},
  photos: {},
  prefs: {
    userId,
    rootOrder: [],
    collapsedRootIds: [],
    hiddenStatIds: [],
    statOrder: [],
    theme: 'system',
    countPlannedInStats: true,
    updatedAt: new Date(0).toISOString(),
  },
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowsForImport, type LocalSnapshot } from '../src/data/importLocal'
import type { User } from '../src/types'
import { graphOf, node } from './helpers'

const CLOUD: User = { id: 'cloud-user', email: 'me@example.com', displayName: 'Me', createdAt: '2026-01-01T00:00:00.000Z' }

function snapshot(): LocalSnapshot {
  const graph = graphOf(node('r'), node('a', ['r']))
  graph.prefs = { ...graph.prefs, userId: 'device-user', rootOrder: ['r'] }
  graph.milestones.m1 = { id: 'm1', nodeId: 'a', text: 'cut a sapphire', done: true, doneAt: '2026-02-01T00:00:00.000Z', order: 0, updatedAt: '2026-02-01T00:00:00.000Z', deletedAt: null }
  graph.entries.e1 = { id: 'e1', nodeId: 'a', date: '2026-02-01', note: 'did the thing', photoIds: ['p1'], createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z', deletedAt: null }
  graph.photos.p1 = { id: 'p1', userId: 'device-user', url: 'data:image/jpeg;base64,x', fullUrl: null, width: 400, height: 300, createdAt: '2026-02-01T00:00:00.000Z' }
  return { localUserId: 'device-user', graph, nodes: 2, entries: 1, milestones: 1, photos: 1 }
}

test('every row is re-keyed to the signed-in account', () => {
  const { graph } = rowsForImport(snapshot(), CLOUD)
  assert.ok(Object.values(graph.nodes).every((n) => n.userId === CLOUD.id))
  assert.ok(Object.values(graph.photos).every((p) => p.userId === CLOUD.id))
  assert.equal(graph.prefs.userId, CLOUD.id)
})

test('ids survive the import, so nothing is orphaned', () => {
  const { graph } = rowsForImport(snapshot(), CLOUD)
  assert.deepEqual(Object.keys(graph.nodes).sort(), ['a', 'r'])
  assert.equal(graph.milestones.m1.nodeId, 'a')
  assert.equal(graph.entries.e1.nodeId, 'a')
  assert.deepEqual(graph.entries.e1.photoIds, ['p1'])
  assert.deepEqual(graph.prefs.rootOrder, ['r'])
  assert.equal(graph.nodes.a.primaryParentId, 'r')
})

test('photos are pushed before the entries that reference them', () => {
  const { rows } = rowsForImport(snapshot(), CLOUD)
  const firstPhoto = rows.findIndex((r) => r.table === 'photos')
  const firstEntry = rows.findIndex((r) => r.table === 'entries')
  assert.ok(firstPhoto !== -1 && firstEntry !== -1)
  assert.ok(firstPhoto < firstEntry, 'a log entry references photo ids')
})

test('every table is carried across', () => {
  const { rows } = rowsForImport(snapshot(), CLOUD)
  const tables = new Set(rows.map((r) => r.table))
  assert.deepEqual([...tables].sort(), ['entries', 'milestones', 'nodes', 'photos', 'prefs'])
})

test('the device copy is not mutated by preparing the import', () => {
  const snap = snapshot()
  const before = structuredClone(snap.graph)
  rowsForImport(snap, CLOUD)
  assert.deepEqual(snap.graph, before, 'the local graph must survive a failed upload untouched')
})

test('updatedAt is bumped so the import wins last-write-wins', () => {
  const snap = snapshot()
  const { graph } = rowsForImport(snap, CLOUD)
  assert.ok(graph.nodes.r.updatedAt > snap.graph.nodes.r.updatedAt)
  assert.ok(graph.entries.e1.updatedAt > snap.graph.entries.e1.updatedAt)
})

test('soft-deleted rows come across too, so an undo still works after importing', () => {
  const snap = snapshot()
  snap.graph.nodes.gone = node('gone', ['r'], { deletedAt: '2026-03-01T00:00:00.000Z' })
  const { rows } = rowsForImport(snap, CLOUD)
  assert.ok(rows.some((r) => r.table === 'nodes' && r.data.id === 'gone'))
})

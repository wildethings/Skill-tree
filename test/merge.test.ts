import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeGraph } from '../src/data/merge'
import { graphOf, node } from './helpers'

const at = (iso: string) => ({ updatedAt: iso })

test('the later write wins per record', () => {
  const mine = graphOf(node('a', [], { title: 'mine', ...at('2026-03-02T00:00:00.000Z') }))
  const theirs = graphOf(node('a', [], { title: 'theirs', ...at('2026-03-01T00:00:00.000Z') }))
  assert.equal(mergeGraph(mine, theirs).nodes.a.title, 'mine')
  assert.equal(mergeGraph(theirs, mine).nodes.a.title, 'mine')
})

test('a load cannot roll back an edit made while it was in flight', () => {
  // The server answered with the state before the edit; the edit must survive.
  const loaded = graphOf(node('a', [], { title: 'old', ...at('2026-03-01T00:00:00.000Z') }))
  const local = graphOf(node('a', [], { title: 'edited', ...at('2026-03-01T00:00:05.000Z') }))
  assert.equal(mergeGraph(local, loaded).nodes.a.title, 'edited')
})

test('records only one side has are kept', () => {
  const mine = graphOf(node('a'))
  const theirs = graphOf(node('b'))
  const merged = mergeGraph(mine, theirs)
  assert.deepEqual(Object.keys(merged.nodes).sort(), ['a', 'b'])
})

test('a soft delete propagates like any other write', () => {
  const deleted = graphOf(node('a', [], { deletedAt: '2026-03-02T00:00:00.000Z', ...at('2026-03-02T00:00:00.000Z') }))
  const alive = graphOf(node('a', [], { ...at('2026-03-01T00:00:00.000Z') }))
  assert.ok(mergeGraph(alive, deleted).nodes.a.deletedAt)
})

test('preferences follow the same rule', () => {
  const mine = graphOf(node('a'))
  const theirs = graphOf(node('a'))
  mine.prefs = { ...mine.prefs, rootOrder: ['a'], updatedAt: '2026-03-02T00:00:00.000Z' }
  theirs.prefs = { ...theirs.prefs, rootOrder: ['b'], updatedAt: '2026-03-01T00:00:00.000Z' }
  assert.deepEqual(mergeGraph(mine, theirs).prefs.rootOrder, ['a'])
})

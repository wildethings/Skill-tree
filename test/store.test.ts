import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useData } from '../src/data/store'
import { buildIndex } from '../src/lib/graph/graph'
import { graphOf, node, USER } from './helpers'

const seed = (...nodes: Parameters<typeof graphOf>) => {
  const graph = graphOf(...nodes)
  graph.prefs.rootOrder = nodes.filter((n) => n.parentIds.length === 0).map((n) => n.id)
  useData.setState({
    status: 'ready',
    user: { id: USER, email: 'a@b.c', displayName: '', createdAt: '2026-01-01T00:00:00.000Z' },
    graph,
    index: buildIndex(graph),
    undo: null,
  })
}
const s = () => useData.getState()

beforeEach(() => seed(node('r'), node('a', ['r']), node('b', ['a'])))

test('advance adds a child, branch adds a sibling', () => {
  const advanced = s().addNode('a', 'advance', { title: 'deeper' })!
  const branched = s().addNode('a', 'branch', { title: 'beside' })!
  assert.equal(s().graph.nodes[advanced].primaryParentId, 'a')
  assert.equal(s().graph.nodes[branched].primaryParentId, 'r')
  assert.equal(s().index.depth[advanced], 2)
  assert.equal(s().index.depth[branched], 1)
})

test('branching from a root falls back to a child, since roots have no siblings', () => {
  const id = s().addNode('r', 'branch')!
  assert.equal(s().graph.nodes[id].primaryParentId, 'r')
})

test('new nodes never carry a base colour', () => {
  const id = s().addNode('a', 'advance')!
  assert.equal(s().graph.nodes[id].baseColor, null)
})

test('a new root gets an unused palette colour and joins the root order', () => {
  const id = s().createRoot({ title: 'Second' })
  assert.equal(s().graph.nodes[id].parentIds.length, 0)
  assert.ok(s().graph.nodes[id].baseColor?.startsWith('oklch'))
  assert.notEqual(s().graph.nodes[id].baseColor, s().graph.nodes.r.baseColor)
  assert.deepEqual(s().graph.prefs.rootOrder, ['r', id])
})

test('deleting a node re-parents its children instead of deleting the subtree', () => {
  s().deleteNode('a')
  assert.ok(s().graph.nodes.a.deletedAt)
  assert.equal(s().graph.nodes.b.deletedAt, null)
  assert.deepEqual(s().graph.nodes.b.parentIds, ['r'])
  assert.equal(s().graph.nodes.b.primaryParentId, 'r')
  assert.equal(s().index.depth.b, 1)
})

test("deleting a root turns its children into roots carrying its colour", () => {
  const colour = s().graph.nodes.r.baseColor
  s().deleteNode('r')
  const a = s().graph.nodes.a
  assert.deepEqual(a.parentIds, [])
  assert.equal(a.primaryParentId, null)
  assert.equal(a.baseColor, colour)
  assert.ok(s().graph.prefs.rootOrder.includes('a'))
  assert.ok(!s().graph.prefs.rootOrder.includes('r'))
  assert.deepEqual(s().index.rootIds, ['a'])
})

test('re-parenting onto an existing cross-link does not duplicate the parent', () => {
  seed(node('r'), node('a', ['r']), node('b', ['a', 'r'], { primaryParentId: 'a' }))
  s().deleteNode('a')
  assert.deepEqual(s().graph.nodes.b.parentIds, ['r'])
})

test('undo restores a deletion exactly, children and root order included', () => {
  const before = structuredClone(s().graph.nodes)
  s().deleteNode('a')
  assert.equal(s().undo?.label, 'Deleted “a”')
  s().applyUndo()
  assert.equal(s().graph.nodes.a.deletedAt, null)
  assert.deepEqual(s().graph.nodes.b.parentIds, before.b.parentIds)
  assert.equal(s().graph.nodes.b.primaryParentId, 'a')
  assert.equal(s().undo, null)
})

test('undo of a root deletion puts the root order back', () => {
  s().createRoot({ title: 'Second' })
  const order = [...s().graph.prefs.rootOrder]
  s().deleteNode('r')
  assert.ok(!s().graph.prefs.rootOrder.includes('r'))
  s().applyUndo()
  assert.deepEqual(s().graph.prefs.rootOrder, order)
})

test('re-parenting is rejected when it would make a loop', () => {
  const err = s().reparent('r', 'b')
  assert.match(err ?? '', /loop/)
  assert.equal(s().graph.nodes.r.parentIds.length, 0)
})

test('re-parenting clears the manual offset and any base colour', () => {
  seed(node('r'), node('r2'), node('a', ['r'], { offset: { dx: 40, dy: 40 } }))
  assert.equal(s().reparent('a', 'r2'), null)
  assert.deepEqual(s().graph.nodes.a.offset, { dx: 0, dy: 0 })
  assert.equal(s().graph.nodes.a.baseColor, null)
  assert.equal(s().index.rootIdOf.a, 'r2')
})

test('re-parenting a root drops it out of the root order', () => {
  seed(node('r'), node('r2'))
  s().reparent('r2', 'r')
  assert.deepEqual(s().graph.prefs.rootOrder, ['r'])
  assert.deepEqual(s().index.rootIds, ['r'])
})

test('a cross-link adds a second parent and keeps the primary', () => {
  seed(node('r1'), node('r2'), node('a', ['r1']))
  assert.equal(s().addCrossLink('a', 'r2'), null)
  assert.deepEqual(s().graph.nodes.a.parentIds, ['r1', 'r2'])
  assert.equal(s().graph.nodes.a.primaryParentId, 'r1')
  assert.deepEqual(s().index.crossChildrenOf.r2, ['a'])
})

test('a cross-link that would loop is refused', () => {
  assert.match(s().addCrossLink('r', 'b') ?? '', /loop|root/)
})

test('the primary parent cannot be removed as if it were a cross-link', () => {
  seed(node('r1'), node('r2'), node('a', ['r1', 'r2'], { primaryParentId: 'r1' }))
  s().removeParent('a', 'r1')
  assert.deepEqual(s().graph.nodes.a.parentIds, ['r1', 'r2'])
  s().removeParent('a', 'r2')
  assert.deepEqual(s().graph.nodes.a.parentIds, ['r1'])
})

test('milestones keep their order and record when they were done', () => {
  s().addMilestone('a', 'first')
  s().addMilestone('a', 'second')
  const ms = Object.values(s().graph.milestones).sort((x, y) => x.order - y.order)
  assert.deepEqual(ms.map((m) => [m.text, m.order]), [['first', 0], ['second', 1]])
  s().toggleMilestone(ms[0].id)
  assert.equal(s().graph.milestones[ms[0].id].done, true)
  assert.ok(s().graph.milestones[ms[0].id].doneAt)
  s().toggleMilestone(ms[0].id)
  assert.equal(s().graph.milestones[ms[0].id].doneAt, null)
})

test('a log entry defaults to today but can be backdated', () => {
  const id = s().addEntry('a', { date: '2025-07-14', note: 'last summer' })
  assert.equal(s().graph.entries[id].date, '2025-07-14')
  assert.notEqual(s().graph.entries[id].createdAt.slice(0, 10), '2025-07-14')
})

test('roots reorder within bounds', () => {
  seed(node('a'), node('b'), node('c'))
  s().moveRoot('c', -1)
  assert.deepEqual(s().index.rootIds, ['a', 'c', 'b'])
  s().moveRoot('a', -1)
  assert.deepEqual(s().index.rootIds, ['a', 'c', 'b'])
})

test('collapse toggles per root and persists in preferences', () => {
  s().toggleCollapse('r')
  assert.deepEqual(s().graph.prefs.collapsedRootIds, ['r'])
  s().toggleCollapse('r')
  assert.deepEqual(s().graph.prefs.collapsedRootIds, [])
})

test('deleting a node clears it from the collapsed set', () => {
  s().toggleCollapse('r')
  s().deleteNode('r')
  assert.deepEqual(s().graph.prefs.collapsedRootIds, [])
})

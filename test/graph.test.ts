import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, descendantsOf, isAncestor, validateParents } from '../src/lib/graph/graph'
import { graphOf, node } from './helpers'

test('roots have empty parentIds and depth 0', () => {
  const i = buildIndex(graphOf(node('a'), node('b')))
  assert.deepEqual(i.rootIds.sort(), ['a', 'b'])
  assert.equal(i.depth.a, 0)
})

test('depth follows the primary parent chain', () => {
  const i = buildIndex(graphOf(node('r'), node('a', ['r']), node('b', ['a']), node('c', ['b'])))
  assert.deepEqual([i.depth.r, i.depth.a, i.depth.b, i.depth.c], [0, 1, 2, 3])
  assert.equal(i.maxDepthOfRoot.r, 3)
  assert.equal(i.rootIdOf.c, 'r')
})

test('D is a property of the whole root, so siblings share a depth', () => {
  // One branch runs deep, the other stops short; both siblings stay at depth 1.
  const i = buildIndex(graphOf(node('r'), node('deep', ['r']), node('shallow', ['r']), node('d2', ['deep'])))
  assert.equal(i.depth.deep, 1)
  assert.equal(i.depth.shallow, 1)
  assert.equal(i.maxDepthOfRoot.r, 2)
})

test('a cross-linked node stays in its primary parent subtree', () => {
  const g = graphOf(node('r1'), node('r2'), node('x', ['r1', 'r2'], { primaryParentId: 'r1' }))
  const i = buildIndex(g)
  assert.deepEqual(i.childrenOf.r1, ['x'])
  assert.deepEqual(i.childrenOf.r2, [])
  assert.deepEqual(i.crossChildrenOf.r2, ['x'])
  assert.equal(i.rootIdOf.x, 'r1')
})

test('subtree size counts primary descendants including self', () => {
  const i = buildIndex(graphOf(node('r'), node('a', ['r']), node('b', ['a']), node('c', ['r'])))
  assert.equal(i.subtreeSize.r, 4)
  assert.equal(i.subtreeSize.a, 2)
  assert.equal(i.subtreeSize.c, 1)
})

test('root order follows user preference, unplaced roots trail behind', () => {
  const g = graphOf(node('a'), node('b'), node('c'))
  g.prefs.rootOrder = ['c', 'a']
  assert.deepEqual(buildIndex(g).rootIds, ['c', 'a', 'b'])
})

test('deleted nodes drop out of the index', () => {
  const g = graphOf(node('r'), node('a', ['r'], { deletedAt: '2026-02-01T00:00:00.000Z' }))
  const i = buildIndex(g)
  assert.deepEqual(i.live.map((n) => n.id), ['r'])
  assert.equal(i.maxDepthOfRoot.r, 0)
})

test('a dangling primaryParentId self-heals to a surviving parent', () => {
  const g = graphOf(node('r'), node('x', ['r'], { primaryParentId: 'gone' }))
  const i = buildIndex(g)
  assert.equal(i.depth.x, 1)
  assert.deepEqual(i.childrenOf.r, ['x'])
})

test('descendantsOf walks the primary tree', () => {
  const i = buildIndex(graphOf(node('r'), node('a', ['r']), node('b', ['a']), node('c', ['r'])))
  assert.deepEqual(descendantsOf(i, 'r').sort(), ['a', 'b', 'c'])
})

test('cycles are rejected, through cross-links too', () => {
  const g = graphOf(node('r'), node('a', ['r']), node('b', ['a']))
  assert.equal(isAncestor(g, 'r', 'b'), true)
  assert.equal(isAncestor(g, 'b', 'r'), false)
  const bad = validateParents(g, 'r', ['b'], 'b')
  assert.equal(bad.ok, false)
  assert.match((bad as { message: string }).message, /loop/)
  assert.equal(validateParents(g, 'b', ['r'], 'r').ok, true)
})

test('self-parenting and a missing primary are rejected', () => {
  const g = graphOf(node('r'), node('a', ['r']))
  assert.equal(validateParents(g, 'a', ['a'], 'a').ok, false)
  assert.equal(validateParents(g, 'a', ['r'], null).ok, false)
  assert.equal(validateParents(g, 'a', [], 'r').ok, false)
  assert.equal(validateParents(g, 'a', [], null).ok, true)
})

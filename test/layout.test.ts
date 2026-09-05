import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex } from '../src/lib/graph/graph'
import { NODE_H, NODE_W, layoutGraph, offsetForDrop } from '../src/lib/graph/layout'
import { graphOf, node } from './helpers'

test('roots sit in a row along the top', () => {
  const g = graphOf(node('a'), node('b'), node('c', ['a']))
  const l = layoutGraph(buildIndex(g), [])
  assert.equal(l.pos.a.y, 0)
  assert.equal(l.pos.b.y, 0)
  assert.ok(l.pos.b.x > l.pos.a.x, 'roots advance left to right')
})

test('roots follow the user-chosen order', () => {
  const g = graphOf(node('a'), node('b'))
  g.prefs.rootOrder = ['b', 'a']
  const l = layoutGraph(buildIndex(g), [])
  assert.ok(l.pos.b.x < l.pos.a.x)
})

test('children hang below their parent, one rank per depth', () => {
  const g = graphOf(node('r'), node('a', ['r']), node('b', ['a']))
  const l = layoutGraph(buildIndex(g), [])
  assert.ok(l.pos.a.y > l.pos.r.y)
  assert.ok(l.pos.b.y > l.pos.a.y)
  assert.equal(l.pos.a.y - l.pos.r.y, l.pos.b.y - l.pos.a.y, 'rank spacing is uniform')
})

test('siblings share a rank and do not overlap', () => {
  const g = graphOf(node('r'), node('a', ['r']), node('b', ['r']))
  const l = layoutGraph(buildIndex(g), [])
  assert.equal(l.pos.a.y, l.pos.b.y)
  assert.ok(Math.abs(l.pos.a.x - l.pos.b.x) >= NODE_W)
})

test('subgraphs never overlap horizontally', () => {
  const g = graphOf(node('r1'), node('a', ['r1']), node('b', ['r1']), node('r2'))
  const l = layoutGraph(buildIndex(g), [])
  const rightEdge = Math.max(l.pos.r1.x, l.pos.a.x, l.pos.b.x) + NODE_W
  assert.ok(l.pos.r2.x >= rightEdge)
})

test('a collapsed root renders alone and stands in for its hidden nodes', () => {
  const g = graphOf(node('r'), node('a', ['r']), node('b', ['a']), node('r2'))
  const l = layoutGraph(buildIndex(g), ['r'])
  assert.ok(l.pos.r)
  assert.equal(l.pos.a, undefined)
  assert.deepEqual([...l.hidden].sort(), ['a', 'b'])
  assert.equal(l.standInFor.b, 'r')
  assert.equal(l.pos.r2.x, NODE_W + 128, 'a collapsed root takes one node of width')
})

test('offsets are applied on top of the tidy position', () => {
  const plain = layoutGraph(buildIndex(graphOf(node('r'), node('a', ['r']))), [])
  const g = graphOf(node('r'), node('a', ['r'], { offset: { dx: 40, dy: -12 } }))
  const nudged = layoutGraph(buildIndex(g), [])
  assert.equal(nudged.pos.a.x, plain.pos.a.x + 40)
  assert.equal(nudged.pos.a.y, plain.pos.a.y - 12)
})

test('a drop is recorded as an offset from the laid-out position', () => {
  const n = node('a', ['r'], { offset: { dx: 10, dy: 0 } })
  assert.deepEqual(offsetForDrop(n, { x: 100, y: 100 }, { x: 130, y: 90 }), { dx: 40, dy: -10 })
})

test('bounds cover every node', () => {
  const l = layoutGraph(buildIndex(graphOf(node('r'), node('a', ['r']))), [])
  assert.equal(l.bounds.minX, 0)
  assert.equal(l.bounds.minY, 0)
  assert.ok(l.bounds.maxY >= l.pos.a.y + NODE_H)
})

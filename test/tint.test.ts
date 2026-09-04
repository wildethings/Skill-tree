import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex } from '../src/lib/graph/graph'
import { MIN_STEP, RAMP, rampAt, tintFor } from '../src/lib/color/tint'
import { parseOklch } from '../src/lib/color/oklch'
import { graphOf, node } from './helpers'

const base = parseOklch('oklch(0.32 0.09 264)')
const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

test('the ramp spans root to leaf exactly', () => {
  near(rampAt(base, 0, 4, 'light').l, RAMP.light.start)
  near(rampAt(base, 4, 4, 'light').l, RAMP.light.end)
  near(rampAt(base, 2, 4, 'light').l, 0.32 + (0.8 - 0.32) * 0.5)
})

test('a lone root sits at the base lightness', () => {
  near(rampAt(base, 0, 0, 'light').l, 0.32)
})

test('deep chains plateau instead of stepping imperceptibly', () => {
  const D = 20 // step would be 0.024, well under the perceptible floor
  near(rampAt(base, 1, D, 'light').l, 0.32 + MIN_STEP)
  near(rampAt(base, 19, D, 'light').l, RAMP.light.end)
  assert.ok(rampAt(base, 20, D, 'light').l <= RAMP.light.end)
})

test('dark mode inverts the ramp so nothing sinks into the canvas', () => {
  const root = rampAt(base, 0, 4, 'dark')
  const leaf = rampAt(base, 4, 4, 'dark')
  near(root.l, RAMP.dark.start)
  near(leaf.l, RAMP.dark.end)
  assert.ok(leaf.l > 0.35, 'deep nodes stay visible on a dark canvas')
  assert.ok(root.l > leaf.l, 'dark mode runs light -> dark')
})

test('dark mode plateaus at its own end, never past it', () => {
  const l = rampAt(base, 30, 30, 'dark').l
  near(l, RAMP.dark.end)
})

test('chroma tapers as lightness rises, so pale steps stay clean', () => {
  assert.ok(rampAt(base, 4, 4, 'light').c < rampAt(base, 0, 4, 'light').c)
  near(rampAt(base, 0, 4, 'light').c, base.c)
})

test('siblings at the same depth get the same tint', () => {
  const i = buildIndex(graphOf(node('r'), node('a', ['r']), node('b', ['r']), node('deep', ['a'])))
  assert.deepEqual(tintFor(i, 'a', 'light').lch, tintFor(i, 'b', 'light').lch)
})

test('adding a node re-shades its ancestors', () => {
  const shallow = buildIndex(graphOf(node('r'), node('a', ['r'])))
  const deeper = buildIndex(graphOf(node('r'), node('a', ['r']), node('b', ['a'])))
  const before = tintFor(shallow, 'a', 'light').lch.l
  const after = tintFor(deeper, 'a', 'light').lch.l
  assert.notEqual(before, after)
  assert.ok(after < before, 'the chain redistributes as it deepens')
})

test('a cross-linked node is filled with a two-stop gradient', () => {
  const i = buildIndex(
    graphOf(
      node('r1', [], { baseColor: 'oklch(0.32 0.12 348)' }),
      node('r2', [], { baseColor: 'oklch(0.32 0.09 205)' }),
      node('x', ['r1', 'r2'], { primaryParentId: 'r1' }),
    ),
  )
  const t = tintFor(i, 'x', 'light')
  assert.equal(t.stops.length, 2)
  assert.match(t.fill, /^linear-gradient\(135deg,/)
  assert.notEqual(Math.round(t.stops[0].h!), Math.round(t.stops[1]!.h!))
  assert.equal(t.fg.includes('gradient'), false, 'the label stays one solid colour')
})

test('single-parent nodes are solid, never gradients', () => {
  const i = buildIndex(graphOf(node('r'), node('a', ['r'])))
  const t = tintFor(i, 'a', 'light')
  assert.equal(t.stops.length, 1)
  assert.match(t.fill, /^oklch/)
})

test('foreground flips to stay legible on the tint', () => {
  const dark = tintFor(buildIndex(graphOf(node('r'))), 'r', 'light')
  const light = tintFor(buildIndex(graphOf(node('r'))), 'r', 'dark')
  assert.match(dark.fg, /0\.985/) // near-white on the dark root
  assert.match(light.fg, /0\.24/) // near-black on the lightened dark-mode root
})

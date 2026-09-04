import type { GraphIndex } from '../graph/graph'
import { BASE_L } from './palette'
import { css, parseOklch, type LCH } from './oklch'

export type Theme = 'light' | 'dark'

/**
 * Lightness endpoints for the depth ramp.
 *
 * Light mode runs dark root -> light leaves: the root is the anchor and each
 * step down the chain sits back a little further from the canvas.
 *
 * Dark mode inverts the mapping rather than filtering the light one. Keeping
 * the light ramp would sink the root into a dark canvas, so the base is
 * lightened and the ramp runs downward — which preserves what the ramp
 * actually encodes, contrast against the canvas falling off with depth.
 */
export const RAMP: Record<Theme, { start: number; end: number }> = {
  light: { start: BASE_L, end: 0.8 },
  dark: { start: 0.8, end: 0.42 },
}

/** Past roughly eight steps the increments stop being perceptible, so we plateau. */
export const MIN_STEP = 0.055

/**
 * Chroma taper, keyed off lightness alone so it behaves identically in both
 * themes: light steps shed chroma to stay inside sRGB instead of clipping to a
 * chalky mess, dark steps keep the full saturation of the base.
 */
const taperChroma = (c: number, l: number): number => c * (1 - 0.42 * Math.min(1, Math.max(0, (l - BASE_L) / 0.48)))

/**
 * Tint for a node at depth `d` in a root whose deepest node sits at depth `D`.
 *
 *   L = L_start + (L_end - L_start) * (d / D)
 *
 * D is a property of the whole root, not of the node's own subtree, which is
 * what makes siblings at the same depth share a tint. It also means adding a
 * node anywhere re-shades the entire root: D changes, and the ramp
 * redistributes. That is the branch visibly deepening, not a bug.
 */
export function rampAt(base: LCH, d: number, D: number, theme: Theme): LCH {
  const { start, end } = RAMP[theme]
  const span = end - start
  const step = D > 0 ? span / D : 0
  // Below the perceptible step size, stop dividing and let the deep end plateau.
  const effective = Math.abs(step) < MIN_STEP ? Math.sign(span) * MIN_STEP : step
  const raw = start + d * effective
  const l = span >= 0 ? Math.min(raw, end) : Math.max(raw, end)
  return { l, c: taperChroma(base.c, l), h: base.h }
}

export type NodeTint = {
  /** Solid fill, or the two stops of a cross-link gradient. */
  stops: [LCH] | [LCH, LCH]
  fill: string
  /** Icon and label colour. A single solid colour even on gradient nodes. */
  fg: string
  lch: LCH
}

/**
 * Interpolate the cross-link gradient in Oklab — the Cartesian form of the same
 * space the ramp is built in. sRGB interpolation between two saturated colours
 * passes through a muddy grey midpoint, which is exactly what this gradient
 * must not do.
 */
const GRADIENT_SPACE =
  typeof CSS !== 'undefined' && CSS.supports?.('background-image', 'linear-gradient(in oklab, red, blue)')
    ? 'in oklab '
    : ''

const solidFg = (lch: LCH) => (lch.l > 0.62 ? 'oklch(0.24 0.012 265)' : 'oklch(0.985 0.002 265)')

export function tintFor(index: GraphIndex, nodeId: string, theme: Theme): NodeTint {
  const node = index.byId[nodeId]
  const d = index.depth[nodeId] ?? 0

  const rampForRoot = (rootId: string | undefined): LCH => {
    const root = rootId ? index.byId[rootId] : undefined
    const base = parseOklch(root?.baseColor ?? 'oklch(0.32 0.09 264)')
    return rampAt(base, d, index.maxDepthOfRoot[rootId ?? ''] ?? 0, theme)
  }

  const own = rampForRoot(index.rootIdOf[nodeId])

  // A node with more than one parent bridges two domains, so it is filled with
  // a two-stop gradient — each parent's own ramp read at this node's depth.
  // This is the only gradient in the app, and it should look special.
  const otherParent = node?.parentIds.find((p) => p !== node.primaryParentId && index.byId[p])
  if (otherParent) {
    const other = rampForRoot(index.rootIdOf[otherParent])
    const bothDark = own.l < 0.55 && other.l < 0.55
    const darker = own.l <= other.l ? own : other
    return {
      stops: [own, other],
      // Stops are pulled inward so each parent holds a solid corner and the two
      // colours meet in a narrow band, rather than washing across the whole tile.
      fill: `linear-gradient(${GRADIENT_SPACE}135deg, ${css(own)} 22%, ${css(other)} 78%)`,
      fg: bothDark ? 'oklch(0.985 0.002 265)' : css({ ...darker, l: Math.min(darker.l, 0.34) }),
      lch: own,
    }
  }

  return { stops: [own], fill: css(own), fg: solidFg(own), lch: own }
}

/**
 * Edges carry the same tint as their nodes, but a 2px stroke cannot hold the
 * pale end of the ramp the way a 54px tile can. This pulls an edge's lightness
 * into a band that stays readable against the canvas, keeping hue and chroma —
 * so a deep branch's edges still read as that branch, and a cross-link between
 * two deep nodes is never invisible.
 */
export function edgeTint(lch: LCH, theme: Theme): LCH {
  return theme === 'light' ? { ...lch, l: Math.min(lch.l, 0.62) } : { ...lch, l: Math.max(lch.l, 0.58) }
}

/**
 * The tint a cross-link edge is drawn in: the source parent's ramp read at the
 * child's depth, so the dashed edge matches its own stop in the child's gradient.
 */
export function crossTint(index: GraphIndex, childId: string, parentId: string, theme: Theme): LCH {
  const rootId = index.rootIdOf[parentId]
  const base = parseOklch(index.byId[rootId ?? '']?.baseColor ?? 'oklch(0.32 0.09 264)')
  return rampAt(base, index.depth[childId] ?? 0, index.maxDepthOfRoot[rootId ?? ''] ?? 0, theme)
}

/** Every node's tint, recomputed from scratch. Derived tints are never persisted. */
export function tintMap(index: GraphIndex, theme: Theme): Record<string, NodeTint> {
  const out: Record<string, NodeTint> = {}
  for (const n of index.live) out[n.id] = tintFor(index, n.id, theme)
  return out
}

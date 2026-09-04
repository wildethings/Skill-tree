import type { LCH } from './oklch'
import { css } from './oklch'

/**
 * Root base colours. Dark and saturated by design: the tint ramp only works if
 * there is room to lighten across, so this is a curated set rather than a free
 * colour wheel. All sit at L 0.32 with well-separated hues.
 */
export const BASE_L = 0.32

type Swatch = { name: string; lch: LCH }

const at = (name: string, h: number, c: number): Swatch => ({ name, lch: { l: BASE_L, c, h } })

export const PALETTE: Swatch[] = [
  at('Ink', 264, 0.09),
  at('Damson', 305, 0.115),
  at('Mulberry', 348, 0.125),
  at('Ember', 32, 0.115),
  at('Bronze', 62, 0.085),
  at('Moss', 132, 0.09),
  at('Fern', 156, 0.085),
  at('Pine', 178, 0.075),
  at('Teal', 205, 0.09),
  at('Harbour', 238, 0.11),
  at('Iris', 282, 0.12),
  at('Clay', 18, 0.075),
]

export const PALETTE_CSS = PALETTE.map((s) => ({ name: s.name, value: css(s.lch) }))

export const defaultBaseColor = (usedColors: string[]): string => {
  // Hand out an unused swatch first so a new root reads as distinct.
  const unused = PALETTE_CSS.find((s) => !usedColors.includes(s.value))
  return (unused ?? PALETTE_CSS[usedColors.length % PALETTE_CSS.length]).value
}

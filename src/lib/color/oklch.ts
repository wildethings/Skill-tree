import { formatCss, formatHex, parse, converter, type Oklch } from 'culori'

const toOklch = converter('oklch')

export type LCH = { l: number; c: number; h: number }

export function parseOklch(css: string): LCH {
  const parsed = parse(css)
  const o = parsed ? (toOklch(parsed) as Oklch | undefined) : undefined
  if (!o) return { l: 0.32, c: 0.12, h: 0 }
  return { l: o.l ?? 0, c: o.c ?? 0, h: o.h ?? 0 }
}

export const css = ({ l, c, h }: LCH): string =>
  formatCss({ mode: 'oklch', l: clamp01(l), c: Math.max(0, c), h }) ?? '#888888'

/** sRGB hex, for canvases and exports that cannot take an oklch() string. */
export const hex = ({ l, c, h }: LCH): string =>
  formatHex({ mode: 'oklch', l: clamp01(l), c: Math.max(0, c), h }) ?? '#888888'

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Foreground that stays legible on a given tint. Neutral, never coloured. */
export const readableOn = ({ l }: LCH): string => (l > 0.62 ? 'oklch(0.24 0.012 265)' : 'oklch(0.985 0.002 265)')

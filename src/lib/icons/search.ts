import { ICON_CATALOG, type IconMeta } from './catalog.generated'

/**
 * The search index is built at build time: each icon carries a pre-lowercased
 * haystack of its name, categories and tags. Ranking one pass over ~1,500
 * entries costs well under a millisecond, so the picker filters on every
 * keystroke with no debounce.
 */
const NAMES = ICON_CATALOG.map((i) => i.name)

export const ALL_ICONS: readonly string[] = NAMES
export const ICON_COUNT = ICON_CATALOG.length

const score = (icon: IconMeta, q: string): number => {
  if (icon.name === q) return 0
  if (icon.name.startsWith(q)) return 1
  if (icon.name.includes(q)) return 2
  // Match a whole word in the tags rather than any substring, so "art" does not
  // drag in every icon tagged "cart".
  const at = icon.terms.indexOf(q)
  if (at === -1) return Infinity
  const boundary = at === 0 || icon.terms[at - 1] === ' '
  return boundary ? 3 : 4
}

export function searchIcons(query: string): readonly string[] {
  const q = query.trim().toLowerCase()
  if (!q) return NAMES

  const hits: Array<{ name: string; rank: number }> = []
  for (const icon of ICON_CATALOG) {
    const rank = score(icon, q)
    if (rank !== Infinity) hits.push({ name: icon.name, rank })
  }
  hits.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name))
  return hits.map((h) => h.name)
}

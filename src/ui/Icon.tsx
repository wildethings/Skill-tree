import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * One local sprite sheet, fetched once and inlined. It has to be inlined rather
 * than referenced with an external <use>: WebKit resolves currentColor in the
 * referenced document, which would strip icons of the node tint they render in.
 */
const FALLBACK = 'circle-dashed'
let symbols: Set<string> | null = null

const useSprite = create<{ ready: boolean; load: () => void }>((set, get) => ({
  ready: false,
  load: () => {
    if (get().ready || typeof document === 'undefined') return
    fetch(`${import.meta.env.BASE_URL}icons/ph-duotone.svg`)
      .then((r) => r.text())
      .then((svg) => {
        const host = document.createElement('div')
        host.setAttribute('aria-hidden', 'true')
        host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
        host.innerHTML = svg
        document.body.prepend(host)
        // Names are stored as plain strings, so a name that no longer exists
        // (a stale record, a Phosphor upgrade) must degrade rather than vanish.
        symbols = new Set(Array.from(host.querySelectorAll('symbol'), (s) => s.id))
        set({ ready: true })
      })
      .catch(() => set({ ready: false }))
  },
}))

export function useIconSprite() {
  const load = useSprite((s) => s.load)
  useEffect(() => load(), [load])
}

export function Icon({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const ready = useSprite((s) => s.ready)
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {ready ? <use href={`#${symbols?.has(`ph-${name}`) ? `ph-${name}` : `ph-${FALLBACK}`}`} /> : null}
    </svg>
  )
}

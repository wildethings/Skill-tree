import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Only the topmost sheet answers Escape, so a nested sheet does not close both. */
let openSheets = 0

/** Panel on desktop, bottom sheet on a phone. Traps focus, closes on Escape. */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [depth] = useState(() => ++openSheets)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && depth === openSheets) {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, depth])

  useEffect(() => () => {
    openSheets -= 1
  }, [])

  return (
    <div className="sheet-scrim" style={{ zIndex: 30 + depth }} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" data-wide={wide || undefined} ref={ref} role="dialog" aria-modal="true">
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <footer className="sheet-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

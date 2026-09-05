import { Suspense, lazy } from 'react'

/**
 * The picker carries the search catalog for ~1,500 icons, which nothing else
 * needs, so it loads on first open rather than at boot.
 */
const IconPicker = lazy(() => import('./IconPicker'))

export function IconPickerPanel(props: { value: string; onPick: (name: string) => void; onClose: () => void }) {
  return (
    <Suspense fallback={<div className="picker picker-loading">Loading icons…</div>}>
      <IconPicker {...props} />
    </Suspense>
  )
}

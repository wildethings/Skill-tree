import { memo, useEffect, useRef, useState } from 'react'
import type { SkillNode } from '../types'
import type { NodeTint } from '../lib/color/tint'
import { NODE_H, NODE_W } from '../lib/graph/layout'
import { Icon } from '../ui/Icon'

export type CardProps = {
  node: SkillNode
  tint: NodeTint
  /** Hidden-node count shown on a collapsed root. */
  collapsedCount: number | null
  milestones: { done: number; total: number } | null
  dimmed: boolean
  highlighted: boolean
  linking: boolean
  register: (el: HTMLElement | null) => void
}

/**
 * At a glance: an icon tile, the title, and a milestone indicator. Nothing else
 * belongs here — the whole tree has to stay readable without opening anything.
 *
 * Position is never a prop. The engine writes this element's transform every
 * frame; React only owns what the card says.
 */
export const NodeCard = memo(function NodeCard({
  node,
  tint,
  collapsedCount,
  milestones,
  dimmed,
  highlighted,
  linking,
  register,
}: CardProps) {
  const planned = node.state === 'planned'
  const gradient = tint.stops.length === 2

  return (
    <div
      ref={register}
      className="node"
      data-id={node.id}
      data-planned={planned || undefined}
      data-dimmed={dimmed || undefined}
      data-highlight={highlighted || undefined}
      data-linking={linking || undefined}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <div
        className="node-tile"
        style={{
          background: planned ? 'transparent' : tint.fill,
          borderColor: tint.stops[0] ? tint.fill : undefined,
          color: planned ? undefined : tint.fg,
          ['--tint' as string]: gradient ? undefined : tint.fill,
        }}
      >
        <Icon name={node.icon} size={26} />
        {collapsedCount ? <CountBadge count={collapsedCount} /> : null}
      </div>

      <div className="node-title" title={node.title || 'Untitled'}>
        {node.title || <span className="node-untitled">Untitled</span>}
      </div>

      {milestones && milestones.total > 0 ? (
        <div className="node-milestones" aria-label={`${milestones.done} of ${milestones.total} milestones`}>
          {Array.from({ length: Math.min(milestones.total, 5) }, (_, i) => (
            <span key={i} data-done={i < milestones.done || undefined} />
          ))}
          {milestones.total > 5 ? <span className="node-milestones-more">+{milestones.total - 5}</span> : null}
        </div>
      ) : null}
    </div>
  )
})

/** The badge counts up as the branch folds away, so it is clear where the nodes went. */
function CountBadge({ count }: { count: number }) {
  const [shown, setShown] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(count)
      return
    }
    const start = performance.now()
    const from = 0
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 380)
      setShown(Math.round(from + (count - from) * (1 - (1 - t) ** 3)))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [count])

  return <span className="node-badge">{shown}</span>
}

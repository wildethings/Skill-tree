import { useMemo, useState } from 'react'
import { useData } from '../data/store'
import { orderedStats, STATS, type StatContext } from '../stats/registry'
import { Icon } from './Icon'

/** A bento grid over whatever the registry found. It never names a stat itself. */
export function Stats() {
  const graph = useData((s) => s.graph)
  const index = useData((s) => s.index)
  const setPrefs = useData((s) => s.setPrefs)
  const [editing, setEditing] = useState(false)

  const { hiddenStatIds, statOrder, countPlannedInStats } = graph.prefs
  const visible = useMemo(() => orderedStats(statOrder, hiddenStatIds), [statOrder, hiddenStatIds])

  const ctx: StatContext = useMemo(
    () => ({
      graph,
      index,
      countPlanned: countPlannedInStats,
      nodes: countPlannedInStats ? index.live : index.live.filter((n) => n.state === 'started'),
    }),
    [graph, index, countPlannedInStats],
  )

  const move = (id: string, direction: -1 | 1) => {
    const order = visible.map((s) => s.id)
    const from = order.indexOf(id)
    const to = from + direction
    if (to < 0 || to >= order.length) return
    order.splice(to, 0, ...order.splice(from, 1))
    setPrefs({ statOrder: order })
  }

  const toggle = (id: string) =>
    setPrefs({
      hiddenStatIds: hiddenStatIds.includes(id) ? hiddenStatIds.filter((h) => h !== id) : [...hiddenStatIds, id],
    })

  return (
    <div className="page">
      <header className="page-head">
        <h1>Stats</h1>
        <div className="page-actions">
          <label className="switch">
            <input
              type="checkbox"
              checked={countPlannedInStats}
              onChange={(e) => setPrefs({ countPlannedInStats: e.target.checked })}
            />
            <span>Count planned nodes</span>
          </label>
          <button className="btn btn-small" onClick={() => setEditing((v) => !v)}>
            <Icon name={editing ? 'check' : 'sliders-horizontal'} size={15} />
            {editing ? 'Done' : 'Arrange'}
          </button>
        </div>
      </header>

      {editing ? (
        <div className="stat-manager">
          {STATS.map((s) => (
            <label key={s.id} className="check check-inline">
              <input type="checkbox" checked={!hiddenStatIds.includes(s.id)} onChange={() => toggle(s.id)} />
              <span>{s.title}</span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="bento">
        {visible.map((s) => (
          <section key={s.id} className="bento-card" data-size={s.size}>
            <header>
              <h2>{s.title}</h2>
              {editing ? (
                <span className="card-move">
                  <button className="btn-icon" onClick={() => move(s.id, -1)} aria-label={`Move ${s.title} earlier`}>
                    <Icon name="arrow-left" size={13} />
                  </button>
                  <button className="btn-icon" onClick={() => move(s.id, 1)} aria-label={`Move ${s.title} later`}>
                    <Icon name="arrow-right" size={13} />
                  </button>
                </span>
              ) : null}
            </header>
            <div className="bento-body">{s.compute(ctx)}</div>
          </section>
        ))}
      </div>

      {visible.length === 0 ? <p className="empty-note">Every card is hidden. Use Arrange to bring one back.</p> : null}
    </div>
  )
}

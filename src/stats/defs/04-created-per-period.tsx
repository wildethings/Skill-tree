import { useState } from 'react'
import type { StatModule } from '../registry'
import { formatMonth, monthKey, parseDay } from '../../lib/date'
import { Columns } from '../parts'

/**
 * Holiday buckets exist because that is the question people actually ask —
 * "what did this summer produce" — which a month grid answers badly.
 */
function holidayBucket(iso: string): { key: string; label: string } {
  const d = parseDay(iso)
  const month = d.getMonth()
  const year = d.getFullYear()
  if (month >= 5 && month <= 7) return { key: `${year}-summer`, label: `Summer ${year}` }
  if (month === 11) return { key: `${year + 1}-winter`, label: `Winter ${year}/${String(year + 1).slice(2)}` }
  if (month === 0) return { key: `${year}-winter`, label: `Winter ${year - 1}/${String(year).slice(2)}` }
  if (month >= 2 && month <= 3) return { key: `${year}-spring`, label: `Spring ${year}` }
  return { key: `${year}-rest`, label: `Rest of ${year}` }
}

export const stat: StatModule = {
  id: 'created-per-period',
  title: 'Nodes created',
  size: 'medium',
  compute: ({ nodes }) => <CreatedPerPeriod dates={nodes.map((n) => n.createdAt.slice(0, 10))} />,
}

function CreatedPerPeriod({ dates }: { dates: string[] }) {
  const [mode, setMode] = useState<'month' | 'holiday'>('month')
  const buckets = new Map<string, { label: string; count: number }>()
  for (const date of dates) {
    const bucket = mode === 'month' ? { key: monthKey(date), label: formatMonth(monthKey(date)) } : holidayBucket(date)
    const existing = buckets.get(bucket.key)
    if (existing) existing.count += 1
    else buckets.set(bucket.key, { label: bucket.label, count: 1 })
  }
  const rows = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12)

  return (
    <>
      <div className="stat-toggle">
        <button data-on={mode === 'month' || undefined} onClick={() => setMode('month')}>
          By month
        </button>
        <button data-on={mode === 'holiday' || undefined} onClick={() => setMode('holiday')}>
          By holiday
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="stat-empty">Nothing created yet.</p>
      ) : (
        <Columns rows={rows.map(([key, v]) => ({ id: key, label: v.label, value: v.count }))} />
      )}
    </>
  )
}

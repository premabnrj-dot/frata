import { levels } from '@/domains/analytics/kit'
import { monthShortIN } from '@/lib/format-date'

// =============================================================================
// FILE: src/components/charts/cohort-table.tsx — SHOPPERS WHO COME BACK (Neel N1b, kit § Shoppers who come back).
// Each month's first-time shoppers and the share who ordered again 1, 2 and 3 months after; a month that has not come
// yet is empty ("not yet" to a screen reader), never 0. Shades by share (kit levels), the % always written.
// =============================================================================

const SHADE = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4', 'bg-heat-5'] as const
const TEXT = ['', '', '', '', 'text-heat-on', 'text-heat-on'] as const

export function CohortTable({ rows }: { rows: { month: Date; shoppers: number; again: (number | null)[] }[] }) {
  const shares = rows.flatMap((r) => r.again.map((n) => (n === null || !r.shoppers ? 0 : n / r.shoppers)))
  const lv = levels(shares)
  return (
    <table className="w-full border-separate border-spacing-1 text-sm">
      <caption className="sr-only">Share of each month&apos;s first-time shoppers who ordered again</caption>
      <thead><tr className="text-label text-muted-foreground">
        <th scope="col" className="text-left font-medium">First order</th><th scope="col" className="text-right font-medium">Shoppers</th>
        <th scope="col" className="text-left font-medium">1 month</th><th scope="col" className="text-left font-medium">2 months</th><th scope="col" className="text-left font-medium">3 months</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.month.toISOString()}>
            <th scope="row" className="text-left font-normal">{monthShortIN(r.month)}</th>
            <td className="text-right font-num tabular-nums">{r.shoppers}</td>
            {r.again.map((n, j) => n === null || !r.shoppers
              ? <td key={j}><span className="sr-only">{n === null ? 'not yet' : '—'}</span></td>
              : <td key={j} className={`rounded-xs px-2 py-1.5 font-num tabular-nums ${SHADE[lv[i * 3 + j]!]} ${TEXT[lv[i * 3 + j]!]}`}>{Math.round((n / r.shoppers) * 100)}%</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

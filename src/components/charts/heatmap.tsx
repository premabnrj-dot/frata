import { busiest, DAYS, HOUR_BUCKETS, levels } from '@/domains/analytics/kit'

// =============================================================================
// FILE: src/components/charts/heatmap.tsx — WHEN ORDERS COME (Neel N1b, kit § When orders come).
// Weekday × three-hour bucket, one colour light to dark (kit levels), the busiest cell named in words under it. A
// screen reader gets the table itself (each cell's count), not a picture.
// =============================================================================

const SHADE = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4', 'bg-heat-5'] as const

export function Heatmap({ grid }: { grid: number[][] }) {
  const flat = levels(grid.flat())
  const words = busiest(grid)
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full table-fixed border-separate border-spacing-1 text-kbd text-muted-foreground">
        <caption className="sr-only">Orders by day of the week and time of day</caption>
        <thead><tr><td className="w-9" />{HOUR_BUCKETS.map((h) => <th key={h} scope="col" className="text-left font-normal">{h}</th>)}</tr></thead>
        <tbody>
          {DAYS.map((d, r) => (
            <tr key={d}>
              <th scope="row" className="text-left font-normal">{d}</th>
              {HOUR_BUCKETS.map((h, c) => <td key={h} className={`h-5.5 rounded-xs ${SHADE[flat[r * HOUR_BUCKETS.length + c]!]}`}><span className="sr-only">{grid[r]![c]}</span></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {words ? <p className="text-label text-muted-foreground">Busiest: {words}.</p> : null}
    </div>
  )
}

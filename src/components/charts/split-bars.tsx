import { splitWords } from '@/domains/analytics/kit'

// =============================================================================
// FILE: src/components/charts/split-bars.tsx — TWO PARTS OF A WHOLE, ROW BY ROW (Neel N1b, kit § Split bars).
// Two parts at most; the chart colour is the one you want more of. The key is SplitLegend, in the heading row. The total at the right, the trend in words under.
// =============================================================================

/** The two parts' key, in the card's heading row (as drawn). */
export function SplitLegend({ a, b }: { a: string; b: string }) {
  return (
    <span className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-label text-muted-foreground" aria-hidden="true">
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-xs bg-chart" />{a}</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-xs bg-heat-3" />{b}</span>
    </span>
  )
}

export function SplitBars({ rows, a, b }: { rows: { label: string; a: number; b: number }[]; a: string; b: string }) {
  const words = splitWords(rows, a)
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full border-separate border-spacing-y-1.5 text-sm">
        <caption className="sr-only">{a} and {b} by week</caption>
        <thead className="sr-only"><tr><th scope="col">Week</th><th scope="col">{a}</th><th scope="col">{b}</th><th scope="col">Orders</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const t = r.a + r.b
            return (
              <tr key={r.label}>
                <th scope="row" className="w-px pr-3 text-left font-normal whitespace-nowrap text-muted-foreground">{r.label}</th>
                <td className="w-full" colSpan={2}>
                  <span role="img" className="flex h-3 overflow-hidden rounded-xs bg-line-soft" aria-label={`${r.a} ${a.toLowerCase()}, ${r.b} ${b}`}>
                    {t ? <><i className="bg-chart" style={{ width: `${(r.a / t) * 100}%` }} /><i className="bg-heat-3" style={{ width: `${(r.b / t) * 100}%` }} /></> : null}
                  </span>
                </td>
                <td className="w-12 pl-3 text-right font-num font-medium tabular-nums">{t}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {words ? <p className="text-label text-muted-foreground">{words}</p> : null}
    </div>
  )
}

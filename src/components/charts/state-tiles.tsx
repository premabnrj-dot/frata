'use client'

import { useState } from 'react'
import { levels, STATE_TILES, TILE_COLS, TILE_ROWS } from '@/domains/analytics/kit'
import type { State } from '@/domains/checkout/states'
import { Section } from '@/components/layout/section'
import { button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/charts/state-tiles.tsx — CAME BACK, BY STATE (Neel N1b, kit § By state), its card included: the
// toggle sits in the heading row, as drawn. A tile per state, every one the same size; darker is worse (the risk ramp,
// even steps). States with fewer than `min` orders with an outcome are outlined, unshaded (too few to judge). On a phone
// the map is a sentence and "See every state" (as drawn); "See as a table" shows every state's figures in place.
// =============================================================================

const SHADE = ['bg-risk-0', 'bg-risk-1', 'bg-risk-2', 'bg-risk-3', 'bg-risk-4', 'bg-risk-5'] as const
const TEXT = ['text-muted-foreground', 'text-risk-text', 'text-risk-text', 'text-risk-text', 'text-risk-on', 'text-risk-on'] as const

type Row = { state: string; outcomes: number; rto: number }

export function StateTiles({ id, title, rows, min = 10 }: { id: string; title: string; rows: Row[]; min?: number }) {
  const [table, setTable] = useState(false)
  const judged = rows.filter((r) => r.outcomes >= min && r.state in STATE_TILES)
  const share = (r: Row) => r.rto / r.outcomes
  const ls = levels(judged.map(share))
  const lv = new Map(judged.map((r, i) => [r.state, ls[i]!]))
  const sorted = [...judged].sort((a, b) => share(b) - share(a))
  const pct = (r: Row) => `${Math.round(share(r) * 100)}%`
  const hi = sorted[0], lo = sorted.at(-1)
  const sentence = hi && lo ? `Came back by state: highest ${hi.state} ${pct(hi)}, lowest ${lo.state} ${pct(lo)}` : 'Too few orders with an outcome in any state yet'
  const toggle = (
    <button type="button" aria-pressed={table} onClick={() => setTable((v) => !v)} className={cn(button({ variant: 'link' }), 'min-h-11 md:min-h-6')}>
      <span className="max-md:hidden">See as a table</span><span className="md:hidden">See every state</span>
    </button>
  )
  return (
    <Section id={id} title={title} flatOnPhone action={toggle}>
      {table ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead><tr className="text-label text-muted-foreground"><th scope="col" className="py-2 text-left font-medium">State</th><th scope="col" className="py-2 text-right font-medium">Came back</th><th scope="col" className="py-2 text-right font-medium">Of orders with an outcome</th></tr></thead>
          <tbody>{[...rows].sort((a, b) => b.outcomes - a.outcomes).map((r) => (
            <tr key={r.state} className="border-t border-line-soft"><th scope="row" className="py-2 text-left font-normal">{r.state}</th>
              <td className="py-2 text-right font-num tabular-nums">{r.outcomes >= min ? pct(r) : '—'}</td><td className="py-2 text-right font-num tabular-nums">{r.rto} of {r.outcomes}</td></tr>
          ))}</tbody>
        </table>
      ) : (
        <>
          <p className="text-sm md:hidden">{hi && lo ? <>Most come back in <b className="font-medium">{hi.state}</b> ({pct(hi)}), fewest in <b className="font-medium">{lo.state}</b> ({pct(lo)}).</> : 'Too few orders with an outcome in any state yet.'}</p>
          <div role="img" aria-label={sentence} className="grid w-full max-w-88 gap-1 max-md:hidden" style={{ gridTemplateColumns: `repeat(${TILE_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${TILE_ROWS}, 2rem)` }}>
            {(Object.entries(STATE_TILES) as [State, (typeof STATE_TILES)[State]][]).map(([state, t]) => {
              const l = lv.get(state)
              return <i key={state} aria-hidden="true" className={cn('grid place-items-center rounded-xs text-kbd font-medium not-italic', l === undefined ? 'border border-line-soft text-muted-foreground' : `${SHADE[l]} ${TEXT[l]}`)} style={{ gridRow: t.row, gridColumn: t.col }}>{t.code}</i>
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-muted-foreground max-md:hidden">
            {lo && hi ? <><span>{pct(lo)}</span><i aria-hidden="true" className="h-1.5 w-24 rounded-full bg-gradient-to-r from-risk-0 via-risk-2 to-risk-5" /><span>{pct(hi)}</span></> : null}
            <span>States with {min}+ orders with an outcome</span>
          </div>
        </>
      )}
    </Section>
  )
}

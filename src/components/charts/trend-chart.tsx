'use client'

import { useId, useState } from 'react'
import { shortValue, ticks } from '@/domains/analytics/kit'

// =============================================================================
// FILE: src/components/charts/trend-chart.tsx — A VALUE BY DAY, THIS PERIOD AGAINST THE ONE BEFORE (Neel N1b, kit § Trend).
//
// SVG drawn here (no chart library). The pointer, or ← → on the focused chart (Home and End to the ends), moves a line
// through the days; the tooltip lists each series with its key. Notes (an offer starting) sit on their day as a thin
// line with a word. Days with returns carry a mark on the baseline. For a screen reader the chart is one sentence and a
// visually hidden table of every day (WCAG 1.1.1); reduced motion: nothing moves anyway.
// =============================================================================

export type TrendPoint = { key: string; label: string; value: number; prev: number; marks: number }

const W = 960, H = 240, L = 52, R = 12, T = 24, B = 34

export function TrendChart({ points, summary, unit, seriesNames, notes = [], marksName }: {
  points: TrendPoint[]; summary: string
  /** What the values are (paise or a count): formatted here, as a server component cannot hand a function down. */
  unit: 'money' | 'count'
  seriesNames: [string, string]; notes?: { key: string; title: string }[]
  /** What the baseline marks count ("came back"); none drawn when absent. */
  marksName?: string
}) {
  const id = useId()
  const format = (n: number) => shortValue(n, unit)
  const [at, setAt] = useState<number | null>(null)
  if (points.length < 2) return null
  const top = ticks(Math.max(...points.map((p) => Math.max(p.value, p.prev)), 1))
  const max = top[2]
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const line = (k: 'value' | 'prev') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ')
  const area = `${line('value')} L${x(points.length - 1).toFixed(1)} ${H - B} L${L} ${H - B}Z`
  const idx = new Map(points.map((p, i) => [p.key, i]))
  const labels = [0, Math.round((points.length - 1) / 3), Math.round(((points.length - 1) * 2) / 3), points.length - 1]
  const p = at === null ? null : points[at]!
  const move = (i: number) => setAt(Math.max(0, Math.min(points.length - 1, i)))
  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-label text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3 bg-chart" />{seriesNames[0]}</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-3 border-t-2 border-dashed border-text-3" />{seriesNames[1]}</span>
        {marksName ? <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-warn-mark" />{marksName}</span> : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} aria-describedby={`${id}-t`} tabIndex={0}
        className="block h-auto w-full rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); move(Math.round((((e.clientX - r.left) / r.width) * W - L) / ((W - L - R) / (points.length - 1)))) }}
        onPointerLeave={() => setAt(null)} onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          const k = e.key
          if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'Home' || k === 'End') {
            e.preventDefault()
            move(k === 'Home' ? 0 : k === 'End' ? points.length - 1 : (at ?? (k === 'ArrowRight' ? -1 : points.length)) + (k === 'ArrowRight' ? 1 : -1))
          } else if (k === 'Escape') setAt(null)
        }}>
        <g className="stroke-line-soft">{top.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}</g>
        <g className="fill-muted-foreground text-[11px]" textAnchor="end">{top.map((t) => <text key={t} x={L - 8} y={y(t) + 4}>{format(t)}</text>)}</g>
        <path d={area} className="fill-heat-1" />
        <path d={line('prev')} fill="none" strokeWidth="1.5" strokeDasharray="4 4" className="stroke-text-3" />
        <path d={line('value')} fill="none" strokeWidth="2" className="stroke-chart" />
        {marksName ? <g className="fill-warn-mark">{points.map((q, i) => (q.marks ? <circle key={q.key} cx={x(i)} cy={H - B - 4} r={q.marks > 2 ? 4 : 3} /> : null))}</g> : null}
        {notes.map((n) => {
          const i = idx.get(n.key)
          return i === undefined ? null : (
            <g key={`${n.key}-${n.title}`}>
              <line x1={x(i)} x2={x(i)} y1={T - 6} y2={H - B} strokeDasharray="2 3" className="stroke-neutral-mark" />
              <text x={x(i) + 6} y={T - 8} className="fill-muted-foreground text-[11px]">{n.title}</text>
            </g>
          )
        })}
        {p ? <g>
          <line x1={x(at!)} x2={x(at!)} y1={T} y2={H - B} className="stroke-foreground" />
          <circle cx={x(at!)} cy={y(p.value)} r="4" strokeWidth="2" className="fill-card stroke-chart" />
        </g> : null}
        <g className="fill-muted-foreground text-[11px]">
          {labels.map((i, j) => <text key={i} x={x(i)} y={H - 10} textAnchor={j === 0 ? 'start' : j === labels.length - 1 ? 'end' : 'middle'}>{points[i]!.label}</text>)}
        </g>
      </svg>
      {p ? (
        <div role="status" className="pointer-events-none absolute top-8 z-10 flex flex-col gap-0.5 rounded-md bg-bar px-2.5 py-2 text-label text-bar-foreground shadow-md"
          style={{ left: `min(calc(${(x(at!) / W) * 100}% + 12px), calc(100% - 11rem))` }}>
          <b className="font-semibold">{p.label}</b>
          <span className="font-num tabular-nums">{seriesNames[0]} {format(p.value)}</span>
          <span className="font-num tabular-nums">{seriesNames[1]} {format(p.prev)}</span>
          {marksName ? <span className="font-num tabular-nums">{p.marks} {marksName}</span> : null}
        </div>
      ) : null}
      {/* A table ignores the 1 px of .sr-only (it grows to its content): the wrapper is what is hidden. */}
      <div className="sr-only"><table id={`${id}-t`}>
        <caption>{summary}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">{seriesNames[0]}</th><th scope="col">{seriesNames[1]}</th>{marksName ? <th scope="col">{marksName}</th> : null}</tr></thead>
        <tbody>{points.map((q) => <tr key={q.key}><th scope="row">{q.label}</th><td>{format(q.value)}</td><td>{format(q.prev)}</td>{marksName ? <td>{q.marks}</td> : null}</tr>)}</tbody>
      </table></div>
    </div>
  )
}

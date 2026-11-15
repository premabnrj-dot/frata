'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { shortValue, ticks } from '@/domains/analytics/kit'

// =============================================================================
// FILE: src/components/charts/trend-chart.tsx — A VALUE BY DAY, THIS PERIOD AGAINST THE ONE BEFORE (Neel N1b, kit § Trend).
//
// SVG drawn here (no chart library), at the width it is given in real pixels (ResizeObserver), so text and strokes keep
// their size on a phone. The pointer, or ← → on the focused chart (Home and End to the ends), moves a line through the
// days; the visible tooltip is for the eye, and ONE live region, always mounted, says the day to a screen reader when a
// key moves it. Notes (an offer starting) sit on their day. Days with returns carry a mark on the baseline. The key is
// TrendLegend, in the card's heading row. For a screen reader the chart is one sentence and a hidden table of every day.
// =============================================================================

export type TrendPoint = { key: string; label: string; value: number; prev: number; marks: number }

const T = 24, B = 30, R = 8

export function TrendChart({ points, summary, unit, seriesNames, notes = [], marksName }: {
  points: TrendPoint[]; summary: string
  /** What the values are (paise or a count): formatted here, as a server component cannot hand a function down. */
  unit: 'money' | 'count'
  seriesNames: [string, string]; notes?: { key: string; title: string }[]
  /** What the baseline marks count ("came back"); none drawn when absent. */
  marksName?: string
}) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(960)
  const [at, setAt] = useState<number | null>(null)
  const [said, setSaid] = useState('')
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e!.contentRect.width); if (w > 0) setW(w) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (points.length < 2) return null
  const format = (n: number) => shortValue(n, unit)
  const phone = W < 520
  // A phone draws no y labels (as drawn): the tooltip and the figures above carry the values.
  const L = phone ? 4 : 52
  const H = phone ? 180 : 240
  const top = ticks(Math.max(...points.map((p) => Math.max(p.value, p.prev)), 1))
  const max = top[2]
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const line = (k: 'value' | 'prev') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ')
  const area = `${line('value')} L${x(points.length - 1).toFixed(1)} ${H - B} L${L} ${H - B}Z`
  const idx = new Map(points.map((p, i) => [p.key, i]))
  const labels = phone ? [0, points.length - 1] : [0, Math.round((points.length - 1) / 3), Math.round(((points.length - 1) * 2) / 3), points.length - 1]
  const p = at === null ? null : points[at]!
  const words = (q: TrendPoint) => `${q.label}: ${seriesNames[0]} ${format(q.value)}, ${seriesNames[1]} ${format(q.prev)}${marksName ? `, ${q.marks} ${marksName}` : ''}`
  const clamp = (i: number) => Math.max(0, Math.min(points.length - 1, i))
  const fromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setAt(clamp(Math.round((e.clientX - r.left - L) / ((W - L - R) / (points.length - 1)))))
  }
  return (
    <div ref={box} className="relative">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} aria-describedby={`${id}-k ${id}-t`} tabIndex={0}
        className="block max-w-full touch-pan-y rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        onPointerMove={fromPointer} onPointerDown={fromPointer} onPointerLeave={() => setAt(null)} onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          const k = e.key
          if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'Home' || k === 'End') {
            e.preventDefault()
            const i = clamp(k === 'Home' ? 0 : k === 'End' ? points.length - 1 : (at ?? (k === 'ArrowRight' ? -1 : points.length)) + (k === 'ArrowRight' ? 1 : -1))
            setAt(i); setSaid(words(points[i]!))
          } else if (k === 'Escape') { setAt(null); setSaid('') }
        }}>
        <g className="stroke-line-soft">{top.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}</g>
        {phone ? null : <g className="fill-muted-foreground text-kbd" textAnchor="end">{top.map((t) => <text key={t} x={L - 8} y={y(t) + 4}>{format(t)}</text>)}</g>}
        <path d={area} className="fill-heat-1" />
        <path d={line('prev')} fill="none" strokeWidth="1.5" strokeDasharray="4 4" className="stroke-text-3" vectorEffect="non-scaling-stroke" />
        <path d={line('value')} fill="none" strokeWidth="2" className="stroke-chart" vectorEffect="non-scaling-stroke" />
        {marksName ? <g className="fill-warn-mark">{points.map((q, i) => (q.marks ? <circle key={q.key} cx={x(i)} cy={H - B - 4} r={q.marks > 2 ? 4 : 3} /> : null))}</g> : null}
        {notes.map((n) => {
          const i = idx.get(n.key)
          if (i === undefined) return null
          // Near the right edge the word ends at its line, so it never runs off the chart.
          const end = x(i) > W * 0.7
          return (
            <g key={`${n.key}-${n.title}`}>
              <line x1={x(i)} x2={x(i)} y1={T - 6} y2={H - B} strokeDasharray="2 3" className="stroke-neutral-mark" />
              <text x={end ? x(i) - 6 : x(i) + 6} y={T - 8} textAnchor={end ? 'end' : 'start'} className="fill-muted-foreground text-kbd">{n.title}</text>
            </g>
          )
        })}
        {p ? <g>
          <line x1={x(at!)} x2={x(at!)} y1={T} y2={H - B} className="stroke-foreground" />
          <circle cx={x(at!)} cy={y(p.value)} r="4" strokeWidth="2" className="fill-card stroke-chart" />
        </g> : null}
        <g className="fill-muted-foreground text-kbd">
          {labels.map((i, j) => <text key={i} x={x(i)} y={H - 10} textAnchor={j === 0 ? 'start' : j === labels.length - 1 ? 'end' : 'middle'}>{points[i]!.label}</text>)}
        </g>
      </svg>
      {p ? (
        <div aria-hidden="true" className="pointer-events-none absolute top-6 z-10 flex flex-col gap-0.5 rounded-md bg-bar px-2.5 py-2 text-label text-bar-foreground shadow-md"
          style={{ left: Math.min(x(at!) + 12, Math.max(0, W - 176)) }}>
          <b className="font-semibold">{p.label}</b>
          <span className="font-num tabular-nums">{seriesNames[0]} {format(p.value)}</span>
          <span className="font-num tabular-nums">{seriesNames[1]} {format(p.prev)}</span>
          {marksName ? <span className="font-num tabular-nums">{p.marks} {marksName}</span> : null}
        </div>
      ) : null}
      <p role="status" className="sr-only">{said}</p>
      <p id={`${id}-k`} className="sr-only">Left and right arrow keys move by day; Home and End go to the first and last day.</p>
      {/* A table ignores the 1 px of .sr-only (it grows to its content): the wrapper is what is hidden. */}
      <div className="sr-only"><table id={`${id}-t`}>
        <caption>{summary}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">{seriesNames[0]}</th><th scope="col">{seriesNames[1]}</th>{marksName ? <th scope="col">{marksName}</th> : null}</tr></thead>
        <tbody>{points.map((q) => <tr key={q.key}><th scope="row">{q.label}</th><td>{format(q.value)}</td><td>{format(q.prev)}</td>{marksName ? <td>{q.marks}</td> : null}</tr>)}</tbody>
      </table></div>
    </div>
  )
}

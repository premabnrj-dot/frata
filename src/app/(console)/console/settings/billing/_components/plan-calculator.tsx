'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { planCostAt } from '@/domains/billing/charges'
import { paise } from '@/domains/money/paise'
import { formatInr, formatPercent } from '@/lib/format'

// Which plan costs least (rework R1 mockup § Plans): the merchant slides a month's delivered sales; each plan's cost is
// planCostAt (its price + deliveredFee, rounded as a bill rounds), the cheapest marked. Plain numbers in, nothing stored.
type P = { code: string; name: string; monthlyPrice: number; feeBps: number }
const MIN = 50_000_00, MAX = 3_000_000_00, STEP = 10_000_00

export function PlanCalculator({ plans, mine }: { plans: P[]; mine: number | null }) {
  const start = mine && mine >= MIN ? Math.min(MAX, Math.round(mine / STEP) * STEP) : 1_00_000_00
  const [sales, setSales] = useState(start)
  const costs = plans.map((p) => planCostAt(paise(sales), p))
  const least = Math.min(...costs)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="sales" className="flex flex-wrap justify-between gap-2"><span className="text-muted-foreground">Delivered sales a month</span><b className="font-num font-semibold">{formatInr(paise(sales))}</b></label>
        <input id="sales" type="range" min={MIN} max={MAX} step={STEP} value={sales} onChange={(e) => setSales(Number(e.target.value))} className="w-full accent-primary" />
        <div className="flex justify-between gap-2 text-small text-muted-foreground">
          <span>₹50,000</span>
          {mine ? <button type="button" className="text-link underline-offset-2 hover:underline" onClick={() => setSales(start)}>Use my sales · {formatInr(paise(start))}</button> : null}
          <span>₹30 lakh</span>
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {plans.map((p, i) => (
          <li key={p.code} className={`flex flex-col gap-1 rounded-lg border px-4 py-3.5 ${costs[i] === least ? 'border-chart-now bg-select' : 'border-border'}`}>
            <span className="flex items-center justify-between gap-1.5"><b className="font-semibold">{p.name}</b>{costs[i] === least ? <Badge tone="ok">Costs least</Badge> : null}</span>
            <span className="font-num text-title font-semibold">{formatInr(costs[i]!)} a month</span>
            <span className="text-label text-muted-foreground">{formatInr(paise(p.monthlyPrice))} plan + {formatInr(paise(costs[i]! - p.monthlyPrice))} fee · {formatPercent(costs[i]! / sales, 1)} of sales</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

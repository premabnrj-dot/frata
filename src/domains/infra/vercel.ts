import { microUsd, sumUsd, type MicroUsd } from '@/domains/money/usd'
import type { Alert } from './alerts'
import { VERCEL } from './rates'

// =============================================================================
// FILE: src/domains/infra/vercel.ts — Vercel's billing charges (FOCUS v1.3 rows from GET /v1/billing/charges,
// frata-integrations § Infrastructure usage) into daily totals, the month's pace and its alerts. Pure.
// EffectiveCost is usage before the Pro credit (BilledCost stays ~0 while the credit covers it, seen 2026-11-11).
// =============================================================================

/** One FOCUS row, only the fields we read. */
export type Charge = {
  ChargePeriodStart: string
  ServiceName: string
  ChargeCategory?: string
  EffectiveCost: number | string
  ConsumedQuantity?: number | string | null
  ConsumedUnit?: string | null
  Tags?: Record<string, string> | null
}

export type UsageRow = { day: string; project: string; service: string; quantity: number; unit: string; costMicros: MicroUsd }

/** Rows summed by (UTC day of the charge period, project, service); rows with neither cost nor quantity are dropped. */
export function aggregateCharges(charges: readonly Charge[]): UsageRow[] {
  const by = new Map<string, UsageRow>()
  for (const c of charges) {
    const day = String(c.ChargePeriodStart).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !c.ServiceName) continue
    const project = (c.Tags?.ProjectName ?? '').slice(0, 100), service = String(c.ServiceName).slice(0, 80)
    const key = `${day}|${project}|${service}`
    const q = Number(c.ConsumedQuantity ?? 0), cost = microUsd(c.EffectiveCost)
    const r = by.get(key) ?? { day, project, service, quantity: 0, unit: String(c.ConsumedUnit ?? '').slice(0, 30), costMicros: 0 as MicroUsd }
    r.quantity += Number.isFinite(q) ? q : 0
    r.costMicros = (r.costMicros + cost) as MicroUsd
    by.set(key, r)
  }
  return [...by.values()].filter((r) => r.costMicros !== 0 || r.quantity !== 0)
}

export type VercelFacts = {
  monthStart: string
  dayOfMonth: number
  daysInMonth: number
  usageMicros: MicroUsd
  projectedMicros: MicroUsd
  /** Usage past the Pro credit: what Spend Management's budget counts. */
  onDemandMicros: MicroUsd
  projectedOnDemandMicros: MicroUsd
  budgetMicros: MicroUsd
  byService: { service: string; micros: MicroUsd }[]
  byProject: { project: string; micros: MicroUsd; share: number }[]
  daily: { day: string; micros: MicroUsd; cpuHours: number }[]
  cpuHours: number
  lastDay: string | null
}

const day = (d: Date) => d.toISOString().slice(0, 10)

/** The calendar month (UTC) so far: usage, pace to the month's end, and how it splits. */
export function vercelFacts(rows: readonly UsageRow[], now: Date, budgetUsd: number = VERCEL.budgetUsd): VercelFacts {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  const elapsed = Math.max(1 / 24, (now.getTime() - start.getTime()) / 86_400_000)
  const month = rows.filter((r) => r.day >= day(start))
  const usage = sumUsd(month.map((r) => r.costMicros))
  const projected = Math.round(usage / elapsed * daysInMonth) as MicroUsd
  const credit = VERCEL.creditUsd * 1e6
  const group = <K extends string>(key: (r: UsageRow) => K) => {
    const m = new Map<K, number>()
    for (const r of month) m.set(key(r), (m.get(key(r)) ?? 0) + r.costMicros)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const days = new Map<string, { micros: number; cpu: number }>()
  for (const r of rows) {
    const d = days.get(r.day) ?? { micros: 0, cpu: 0 }
    d.micros += r.costMicros
    if (r.service === 'Fluid Active CPU') d.cpu += r.unit.toLowerCase().startsWith('hour') ? r.quantity : r.quantity / 3600
    days.set(r.day, d)
  }
  const daily = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30).map(([d, v]) => ({ day: d, micros: v.micros as MicroUsd, cpuHours: Math.round(v.cpu * 100) / 100 }))
  return {
    monthStart: day(start), dayOfMonth: now.getUTCDate(), daysInMonth,
    usageMicros: usage, projectedMicros: projected,
    onDemandMicros: Math.max(0, usage - credit) as MicroUsd, projectedOnDemandMicros: Math.max(0, projected - credit) as MicroUsd,
    budgetMicros: Math.round(budgetUsd * 1e6) as MicroUsd,
    byService: group((r) => r.service).map(([service, micros]) => ({ service, micros: micros as MicroUsd })),
    byProject: group((r) => r.project || 'unattributed').map(([project, micros]) => ({ project, micros: micros as MicroUsd, share: usage ? micros / usage : 0 })),
    daily, cpuHours: Math.round(daily.filter((d) => d.day >= day(start)).reduce((a, d) => a + d.cpuHours, 0) * 100) / 100,
    lastDay: daily.at(-1)?.day ?? null,
  }
}

export const RULES = { spikeTimes: 3, spikeMinUsd: 0.5, projectShare: 0.4, ourProject: 'frata' } as const

const usd = (m: number) => `$${(m / 1e6).toFixed(m >= 100e6 ? 0 : 2)}`

/** The Vercel tab's alerts. */
export function vercelAlerts(f: VercelFacts): Alert[] {
  const out: Alert[] = []
  if (f.budgetMicros > 0 && f.onDemandMicros >= f.budgetMicros * 0.75) {
    out.push({ key: 'vercel.budget', tab: 'vercel', level: 'now', title: `${usd(f.onDemandMicros)} of the ${usd(f.budgetMicros)} budget used`, why: 'At the budget, Vercel pauses every shop' })
  } else if (f.budgetMicros > 0 && f.projectedOnDemandMicros > f.budgetMicros) {
    out.push({ key: 'vercel.pace', tab: 'vercel', level: 'soon', title: `On pace for ${usd(f.projectedMicros)} this month`, why: `Past the $20 credit, ${usd(f.projectedOnDemandMicros)} against the ${usd(f.budgetMicros)} budget` })
  }
  const done = f.daily.slice(0, -1) // the last day may still be filling in
  const last = done.at(-1), before = done.slice(-8, -1)
  if (last && before.length >= 3) {
    const avg = before.reduce((a, d) => a + d.micros, 0) / before.length
    if (last.micros > RULES.spikeMinUsd * 1e6 && last.micros > avg * RULES.spikeTimes) {
      out.push({ key: 'vercel.spike', tab: 'vercel', level: 'now', title: `${last.day}: ${(last.micros / Math.max(avg, 1)).toFixed(1)}× a normal day`, why: `${usd(last.micros)} against ${usd(avg)} on average · check the Firewall’s traffic` })
    }
  }
  const other = f.byProject.find((p) => p.project !== RULES.ourProject && p.share > RULES.projectShare)
  if (other) {
    out.push({ key: 'vercel.project', tab: 'vercel', level: 'soon', title: `${other.project} is ${Math.round(other.share * 100)}% of this month’s usage`, why: 'It shares Frrata’s budget and its pause · move it to its own account' })
  }
  return out
}

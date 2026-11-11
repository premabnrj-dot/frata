import { SUPABASE } from './rates'

// =============================================================================
// FILE: src/domains/infra/alerts.ts — what needs staff's attention on Admin › Infrastructure, derived from the facts on
// each page load (no stored alert state: architecture review MAJOR 3; a table returns with notifications). Pure.
// Words follow the voice rules: what is true, then the number and the limit.
// =============================================================================

export type Tab = 'vercel' | 'mux' | 'supabase'
export type Alert = { key: string; tab: Tab; level: 'now' | 'soon'; title: string; why: string }

export type DbHealth = {
  dbBytes: number
  maxConnections: number
  cacheHit: number | null
  connections: { role: string; open: number; busy: number }[]
  outboxWaiting: number
  outboxOldestS: number | null
  outboxDeadToday: number
  webhooksWaiting: number
  tables: { name: string; rows: number; bytes: number }[]
  queries: { shape: string; calls: number; meanMs: number; totalMs: number }[]
}

export const LIMITS = { connectionsShare: 0.8, diskShare: 0.8, diskNowShare: 0.95, outboxWaitS: 600, queryMeanMs: 1000, webhooksWaiting: 50 } as const

const mb = (b: number) => `${Math.round(b / (1024 * 1024))} MB`

/** The Supabase tab's alerts. */
export function supabaseAlerts(h: DbHealth, plan: 'free' | 'pro' = SUPABASE.plan): Alert[] {
  const out: Alert[] = []
  const open = h.connections.reduce((n, c) => n + c.open, 0)
  if (h.maxConnections > 0 && open / h.maxConnections > LIMITS.connectionsShare) {
    out.push({ key: 'db.connections', tab: 'supabase', level: 'now', title: `Connections at ${open} of ${h.maxConnections}`, why: 'New requests wait for a free connection, then fail' })
  }
  const disk = SUPABASE.diskBytes[plan]
  if (h.dbBytes / disk > LIMITS.diskShare) {
    out.push({ key: 'db.disk', tab: 'supabase', level: h.dbBytes / disk > LIMITS.diskNowShare ? 'now' : 'soon', title: `Database at ${mb(h.dbBytes)} of ${mb(disk)}`, why: plan === 'free' ? 'Past the limit Supabase makes it read-only' : 'Past the plan, each GB is billed' })
  }
  if (h.outboxOldestS !== null && h.outboxOldestS > LIMITS.outboxWaitS) {
    out.push({ key: 'db.outbox', tab: 'supabase', level: 'now', title: `Outbox waiting ${Math.round(h.outboxOldestS / 60)} minutes`, why: `${h.outboxWaiting} messages, payments or courier calls behind` })
  }
  if (h.outboxDeadToday > 0) {
    out.push({ key: 'db.outbox_dead', tab: 'supabase', level: 'soon', title: `${h.outboxDeadToday} outbox ${h.outboxDeadToday === 1 ? 'call' : 'calls'} gave up today`, why: 'Retried until their limit; each needs a look' })
  }
  if (h.webhooksWaiting > LIMITS.webhooksWaiting) {
    out.push({ key: 'db.webhooks', tab: 'supabase', level: 'soon', title: `${h.webhooksWaiting} webhooks not processed`, why: 'Payment and courier updates are behind' })
  }
  const slow = h.queries.find((q) => q.meanMs > LIMITS.queryMeanMs)
  if (slow) {
    out.push({ key: 'db.slow_query', tab: 'supabase', level: 'soon', title: `A query takes ${(slow.meanMs / 1000).toFixed(1)} s on average`, why: `${slow.calls} calls · ${slow.shape}` })
  }
  if (plan === 'free') {
    out.push({ key: 'db.free_plan', tab: 'supabase', level: 'soon', title: 'The database is on Supabase’s Free plan', why: `Free pauses after a week with no activity; past its limits, shops can turn read-only or offline · Pro from $${SUPABASE.proFromUsd}` })
  }
  return out
}

export const countFor = (alerts: Alert[], tab: Tab) => alerts.filter((a) => a.tab === tab).length

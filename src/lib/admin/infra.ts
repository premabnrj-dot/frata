import 'server-only'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { DbHealth } from '@/domains/infra/alerts'
import type { VideoFact } from '@/domains/infra/mux'
import { aggregateCharges, type UsageRow } from '@/domains/infra/vercel'
import type { MicroUsd } from '@/domains/money/usd'
import { readCharges } from '@/lib/connectors/vercel/billing'
import { infraPulls, infraUsageDaily } from '@/lib/db/schema-infra'
import { readDelivery } from '@/lib/video/mux-usage'
import type { StaffOk } from '@/lib/auth/require-staff'
import { adminDb } from '@/lib/db/admin'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/admin/infra.ts — Admin › Infrastructure's reads (plan docs/plans/2026-11-11-guardrails-infra-a2.md I·0).
// The Supabase tab reads the database's health live through `admin_db_health()` (drizzle/0091): aggregates only, no row,
// no session's query or address (ADR-0007 amendment). Staff only: the caller passes its StaffOk.
// =============================================================================

const n = z.coerce.number()
const Health = z.object({
  db_bytes: n, max_connections: n, cache_hit: n.nullable(),
  connections: z.array(z.object({ role: z.string(), open: n, busy: n })),
  outbox_waiting: n, outbox_oldest_s: n.nullable(), outbox_dead_today: n, webhooks_waiting: n,
  tables: z.array(z.object({ name: z.string(), rows: n, bytes: n })),
  queries: z.array(z.object({ shape: z.string(), calls: n, mean_ms: n, total_ms: n })),
})

/** The database's health now, or null when Admin can't read it (the tab says so; nothing else on the page fails). */
export async function dbHealth(staff: StaffOk): Promise<DbHealth | null> {
  void staff
  try {
    const [row] = await adminDb().execute<{ h: unknown }>(sql`select admin_db_health() as h`) as unknown as { h: unknown }[]
    const h = Health.parse(row?.h)
    return {
      dbBytes: h.db_bytes, maxConnections: h.max_connections, cacheHit: h.cache_hit, connections: h.connections,
      outboxWaiting: h.outbox_waiting, outboxOldestS: h.outbox_oldest_s, outboxDeadToday: h.outbox_dead_today, webhooksWaiting: h.webhooks_waiting,
      tables: h.tables, queries: h.queries.map((q) => ({ shape: q.shape, calls: q.calls, meanMs: q.mean_ms, totalMs: q.total_ms })),
    }
  } catch (e) {
    console.error('[infra] db health', errName(e))
    return null
  }
}

// ── Vendors' usage (infra_usage_daily, infra_pulls: drizzle/0092–0093) ──────────────────────────────────────────────

export type Source = 'vercel' | 'mux'
export type Pull = { at: Date; ok: boolean; why: string | null }

/** Upsert a vendor's daily rows (idempotent: a re-read day replaces itself). */
export async function saveUsage(source: Source, rows: readonly (UsageRow & { subject?: string })[]) {
  if (!rows.length) return
  const values = rows.map((r) => ({ source, day: r.day, project: r.project, service: r.service, subject: r.subject ?? '', quantity: r.quantity, unit: r.unit, costMicros: r.costMicros, fetchedAt: new Date() }))
  for (let i = 0; i < values.length; i += 500) {
    await adminDb().insert(infraUsageDaily).values(values.slice(i, i + 500)).onConflictDoUpdate({
      target: [infraUsageDaily.source, infraUsageDaily.day, infraUsageDaily.project, infraUsageDaily.service, infraUsageDaily.subject],
      set: { quantity: sql`excluded.quantity`, unit: sql`excluded.unit`, costMicros: sql`excluded.cost_micros`, fetchedAt: sql`excluded.fetched_at` },
    })
  }
}

/** A pull's outcome (a short code, never a vendor's text); pulls older than 30 days are let go. */
export async function recordPull(source: Source, ok: boolean, why: string | null) {
  await adminDb().insert(infraPulls).values({ source, ok, why: why?.slice(0, 40) ?? null })
  await adminDb().delete(infraPulls).where(and(eq(infraPulls.source, source), lt(infraPulls.at, new Date(Date.now() - 30 * 86_400_000))))
}

/** A source's rows from a day on (YYYY-MM-DD). */
export async function usageRows(source: Source, fromDay: string): Promise<(UsageRow & { subject: string })[]> {
  const rows = await adminDb().select().from(infraUsageDaily).where(and(eq(infraUsageDaily.source, source), gte(infraUsageDaily.day, fromDay)))
  return rows.map((r) => ({ day: String(r.day), project: r.project, service: r.service, subject: r.subject, quantity: Number(r.quantity), unit: r.unit, costMicros: r.costMicros as MicroUsd }))
}

/** The latest pull of a source, and the latest that worked. */
export async function lastPulls(source: Source): Promise<{ last: Pull | null; lastOk: Pull | null }> {
  const pick = (rows: { at: Date; ok: boolean; why: string | null }[]) => rows[0] ? { at: rows[0].at, ok: rows[0].ok, why: rows[0].why } : null
  const cols = { at: infraPulls.at, ok: infraPulls.ok, why: infraPulls.why }
  const [last, lastOk] = await Promise.all([
    adminDb().select(cols).from(infraPulls).where(eq(infraPulls.source, source)).orderBy(desc(infraPulls.at)).limit(1),
    adminDb().select(cols).from(infraPulls).where(and(eq(infraPulls.source, source), eq(infraPulls.ok, true))).orderBy(desc(infraPulls.at)).limit(1),
  ])
  return { last: pick(last), lastOk: pick(lastOk) }
}

/** The hourly pull of Vercel's billing: the month on the first run, then the last 3 days (charges are revised). */
export async function pullVercel(now: Date, deadline: number): Promise<Pull> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const have = await adminDb().select({ n: sql<number>`count(*)::int` }).from(infraUsageDaily)
    .where(and(eq(infraUsageDaily.source, 'vercel'), gte(infraUsageDaily.day, monthStart.toISOString().slice(0, 10))))
  const from = (have[0]?.n ?? 0) > 0 ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2)) : new Date(monthStart.getTime() - 7 * 86_400_000)
  const read = await readCharges(from, now, deadline)
  if (!read.ok) { await recordPull('vercel', false, read.why); return { at: now, ok: false, why: read.why } }
  await saveUsage('vercel', aggregateCharges(read.charges))
  await recordPull('vercel', true, null)
  return { at: now, ok: true, why: null }
}

// ── Mux (the read-only token's delivery usage, and Frrata's own video facts) ────────────────────────────────────────

/** The hourly pull of Mux's delivery: each of the last 3 whole UTC days that ended at least 12 h ago (Mux's lag). */
export async function pullMux(now: Date, deadline: number): Promise<Pull> {
  const ready = now.getTime() - 12 * 3_600_000
  const days: Date[] = []
  for (let d = 1; d <= 4 && days.length < 3; d++) {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d))
    if (s.getTime() + 86_400_000 <= ready) days.push(s)
  }
  const rows: (UsageRow & { subject: string })[] = []
  for (const s of days) {
    const read = await readDelivery(s.getTime() / 1000, s.getTime() / 1000 + 86_400, deadline)
    if (!read.ok) { await recordPull('mux', false, read.why); return { at: now, ok: false, why: read.why } }
    const day = s.toISOString().slice(0, 10)
    for (const a of read.assets) rows.push({ day, project: '', service: 'delivery', subject: a.assetId, quantity: a.seconds / 60, unit: 'minutes', costMicros: 0 as MicroUsd })
  }
  await saveUsage('mux', rows)
  await recordPull('mux', true, null)
  return { at: now, ok: true, why: null }
}

const VideoRowZ = z.object({
  asset_id: z.string().nullable(), tenant_id: z.string(), shop: z.string(), plan: z.string().nullable(), on_trial: z.boolean().nullable(),
  use: z.enum(['loop', 'product']), duration_ms: z.number().nullable(), created_at: z.string(), uploaded: z.boolean(),
  ready_at: z.string().nullable(), mp4_ready_at: z.string().nullable(), errored_at: z.string().nullable(), error: z.string().nullable(),
  removed_at: z.string().nullable(), product: z.string().nullable(),
})
const d = (s: string | null) => (s ? new Date(s) : null)

/** Frrata's own videos for the month's picture (admin_video_usage, drizzle/0095: no playback or upload ids). */
export async function videoFacts(staff: StaffOk, since: Date): Promise<VideoFact[] | null> {
  void staff
  try {
    const [row] = await adminDb().execute<{ v: unknown }>(sql`select admin_video_usage(${since.toISOString()}::timestamptz) as v`) as unknown as { v: unknown }[]
    return z.array(VideoRowZ).parse(row?.v ?? []).map((r) => ({
      assetId: r.asset_id, tenantId: r.tenant_id, shop: r.shop, plan: r.plan, onTrial: !!r.on_trial, use: r.use, durationMs: r.duration_ms,
      createdAt: new Date(r.created_at), uploaded: r.uploaded, readyAt: d(r.ready_at), mp4ReadyAt: d(r.mp4_ready_at), erroredAt: d(r.errored_at),
      error: r.error, removedAt: d(r.removed_at), product: r.product,
    }))
  } catch (e) { console.error('[infra] videos', errName(e)); return null }
}

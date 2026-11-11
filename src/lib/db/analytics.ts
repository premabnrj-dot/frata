import 'server-only'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { IngestBatch } from '@/domains/analytics/event'
import { ANALYTICS_DATABASE_URL } from '@/lib/env'
import * as schema from './analytics-schema'
import { attachPool, POOL, poolReleased, releaseOnQuery } from './index'
import { parseDatabaseUrl } from './url'

// =============================================================================
// FILE: src/lib/db/analytics.ts — THE ANALYTICS DATABASE'S CONNECTION (A·2; plan docs/plans/2026-11-11-guardrails-infra-a2.md
// A2·1). Its own Postgres, as frata_app (no BYPASSRLS): the same two locks as the main database (ADR-0002), the row
// policies of drizzle-analytics/0002 and withAnalyticsTenant() here. Proved by scripts/verify/analytics-tenancy.sql.
//
// Never opened inside a main-database transaction, and never awaited by one: a stalled analytics database must not
// hold an order's connection (architecture review MAJOR 5). Small and quick to give up (speed review MED 7): 5
// connections (main 10 + analytics 5 per instance, against the pooler's 200), a 2 s connect timeout, and the role's
// own 2 s statement timeout in that database (drizzle-analytics/0000).
// =============================================================================

const ANALYTICS_POOL = { ...POOL, max: 5, connect_timeout: 2 } as const

let client: ReturnType<typeof drizzle<typeof schema>> | null = null

function analyticsDb() {
  if (!client) {
    attachPool()
    client = drizzle(postgres(parseDatabaseUrl(ANALYTICS_DATABASE_URL, 'frata_app', 'ANALYTICS_DATABASE_URL'), ANALYTICS_POOL), { schema, logger: releaseOnQuery })
  }
  return client
}

export type AnalyticsTx = Parameters<Parameters<ReturnType<typeof analyticsDb>['transaction']>[0]>[0]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One shop's rollups, read in one transaction with the shop set (as withTenant; the tenant comes from requireMember). */
export async function withAnalyticsTenant<T>(tenantId: string, work: (tx: AnalyticsTx) => Promise<T>): Promise<T> {
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) throw new Error('withAnalyticsTenant: not a shop id')
  try {
    return await analyticsDb().transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
      return work(tx)
    }, { accessMode: 'read only' })
  } finally {
    poolReleased()
  }
}

/** Inserts waiting on the database at once, per instance, past which a beacon is dropped (speed review MED 7). */
const MAX_IN_FLIGHT = 20
let inFlight = 0

/**
 * One beacon in one round trip: ingest_events() sets the shop around its insert (then restores the caller's, and
 * refuses a different shop than one already set) and inserts under the events policy (it is not a definer). The
 * tenant is the host's (requireShop), never the body's. 'dropped' when the database is already behind; a failure
 * throws, and the caller (in after()) logs its name only.
 */
export async function ingestBatch(tenantId: string, visitorInput: string, batch: IngestBatch): Promise<number | 'dropped'> {
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) throw new Error('ingestBatch: not a shop id')
  if (inFlight >= MAX_IN_FLIGHT) return 'dropped'
  inFlight++
  try {
    const rows = await analyticsDb().execute<{ n: number }>(sql`select ingest_events(${tenantId}::uuid, ${visitorInput}, ${JSON.stringify(batch)}::jsonb) as n`)
    return Number((rows as unknown as { n: number }[])[0]?.n ?? 0)
  } finally {
    inFlight--
    poolReleased()
  }
}

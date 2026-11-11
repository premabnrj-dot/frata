import 'server-only'
import { cache } from 'react'
import { after } from 'next/server'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { POOL } from './index'
import { ADMIN_DATABASE_URL } from '@/lib/env'
import * as schema from './schema'
import { parseDatabaseUrl } from './url'

// =============================================================================
// FILE: src/lib/db/admin.ts
//
// ADMIN'S CONNECTION, as frata_admin (ADR-0007): the only role that reads
// across tenants, with exactly the reach drizzle/0006_admin_access.sql lists
// (no order rows, outbox or webhooks). Imported only from src/lib/admin/**,
// which is imported only from src/app/(admin)/** (scripts/check-tenant.mjs).
//
// ONE CONNECTION PER REQUEST, ended when the request is done (2026-11-11, root cause of Admin pages that hung until
// Vercel's 60 s limit). A pool kept across requests met Admin's traffic — a few clicks, seconds apart, then nothing —
// at its worst: a new query landed on a connection just as its 5 s idle close fired, or on one left open while the
// instance was paused, and was never sent. Supavisor's log shows it: the client socket "closed while state was idle"
// at the very moment Vercel killed each request (Supabase KB: "hanging queries in Serverless Functions"). A request
// now opens its own (React `cache`: one per render; a route handler or action gets one per call) and `after()`
// ends it, so no connection outlives the request that opened it. Admin is a handful of staff: one connect per page
// (~20 ms to the pooler in bom1) is cheap.
// =============================================================================

function open() {
  const sql = postgres(parseDatabaseUrl(ADMIN_DATABASE_URL, 'frata_admin', 'ADMIN_DATABASE_URL'), { ...POOL, max: 2, idle_timeout: 5 })
  // Outside a request (a script, a test) there is nothing to hook: its idle timeout closes it.
  try { after(() => sql.end({ timeout: 2 })) } catch { /* not in a request */ }
  return drizzle(sql, { schema })
}

export const adminDb = cache(open)

export type AdminDb = ReturnType<typeof adminDb>
export type AdminTx = Parameters<Parameters<AdminDb['transaction']>[0]>[0]

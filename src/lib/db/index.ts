import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { DATABASE_URL } from '@/lib/env'
import * as schema from './schema'
import { parseDatabaseUrl } from './url'

// =============================================================================
// FILE: src/lib/db/index.ts
//
// THE ONE CONNECTION. It logs in as `frata_app` (drizzle/0001), a role with no
// BYPASSRLS, so every tenant table's policy applies to it. Never connect the app
// as `postgres`: that role bypasses the policies that keep merchants apart.
//
// prepare:false because Supabase's pooler runs in transaction mode.
// Lazy, so a build with no DATABASE_URL still compiles every page.
//
// ⚠️ THE URL IS CHECKED BEFORE postgres.js SEES IT. postgres.js throws
// `Invalid URL` with the whole string — password included — as the error's
// `input`, and Vercel logs it (2026-11-06: a password containing `/` leaked
// this way). parseDatabaseUrl (./url.ts) fails with a message, never the value.
// =============================================================================

/**
 * The pool (speed review P12): an idle connection is let go after 20 s, so warm-but-idle functions stop holding
 * Supavisor's client slots (about 200 on small tiers: 20 instances × 10 used them all); a connect that hangs
 * fails in 5 s; a connection is renewed every 10 minutes. `prepare: false` for Supavisor's transaction mode.
 */
export const POOL = { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 5, max_lifetime: 600 } as const

let client: ReturnType<typeof drizzle<typeof schema>> | null = null

export function db() {
  if (!client) {
    client = drizzle(postgres(parseDatabaseUrl(DATABASE_URL, 'frata_app'), POOL), { schema })
  }
  return client
}

export type Db = ReturnType<typeof db>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

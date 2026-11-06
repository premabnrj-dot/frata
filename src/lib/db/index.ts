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

let client: ReturnType<typeof drizzle<typeof schema>> | null = null

export function db() {
  if (!client) {
    client = drizzle(postgres(parseDatabaseUrl(DATABASE_URL), { prepare: false, max: 10 }), { schema })
  }
  return client
}

export type Db = ReturnType<typeof db>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

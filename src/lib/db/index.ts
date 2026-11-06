import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { DATABASE_URL } from '@/lib/env'
import * as schema from './schema'

// =============================================================================
// FILE: src/lib/db/index.ts
//
// THE ONE CONNECTION. It logs in as `frata_app` (drizzle/0001), a role with no
// BYPASSRLS, so every tenant table's policy applies to it. Never connect the app
// as `postgres`: that role bypasses the policies that keep merchants apart.
//
// prepare:false because Supabase's pooler runs in transaction mode.
// Lazy, so a build with no DATABASE_URL still compiles every page.
// =============================================================================

let client: ReturnType<typeof drizzle<typeof schema>> | null = null

export function db() {
  if (!client) {
    if (!DATABASE_URL) throw new Error('[db] DATABASE_URL is not set')
    client = drizzle(postgres(DATABASE_URL, { prepare: false, max: 10 }), { schema })
  }
  return client
}

export type Db = ReturnType<typeof db>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

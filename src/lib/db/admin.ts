import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { attachPool, POOL, releaseOnQuery } from './index'
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
// A small pool: Admin is a handful of staff, not shoppers. Short idle, released per query (owner, 2026-11-09:
// Admin pages hung on a socket frozen with the instance).
// =============================================================================

let client: ReturnType<typeof drizzle<typeof schema>> | null = null

export function adminDb() {
  if (!client) {
    attachPool()
    // idle_timeout 5 s: well inside the 20 s the function is held open after the last query, so no Admin socket is
    // ever frozen with the instance (src/lib/db/index.ts, attachPool).
    client = drizzle(
      postgres(parseDatabaseUrl(ADMIN_DATABASE_URL, 'frata_admin', 'ADMIN_DATABASE_URL'), { ...POOL, max: 2, idle_timeout: 5 }),
      { schema, logger: releaseOnQuery },
    )
  }
  return client
}

export type AdminDb = ReturnType<typeof adminDb>
export type AdminTx = Parameters<Parameters<AdminDb['transaction']>[0]>[0]

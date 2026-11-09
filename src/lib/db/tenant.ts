import 'server-only'
import { sql } from 'drizzle-orm'
import { db, poolReleased, type Tx } from './index'

// =============================================================================
// FILE: src/lib/db/tenant.ts
//
// THE ONLY WAY TO TOUCH A MERCHANT'S ROWS (ADR-0002). Opens a transaction, sets
// `app.tenant_id` for THAT TRANSACTION ONLY (set_config's third argument), and
// hands the callback the transaction. The row policies read it; outside this,
// a tenant table returns nothing.
//
// ⚠️ TRANSACTION-LOCAL, NEVER SESSION. The pooler hands one connection to many
// requests; a session-level SET would leak one merchant's id into the next
// request on that connection. set_config(…, true) ends with the transaction.
//
// The tenant id comes from requireMember() or the storefront host lookup —
// never from a URL, a form field or a request body.
// =============================================================================

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function withTenant<T>(tenantId: string, work: (tx: Tx) => Promise<T>, opts?: { snapshot?: boolean }): Promise<T> {
  // A shop id that isn't one is a bug upstream (2026-11-09: the outbox handed senders `undefined`); never run with it.
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) throw new Error('withTenant: not a shop id')
  try {
    return await withTenantTx(tenantId, work, opts)
  } finally {
    poolReleased() // the connection is back in the pool (attachDatabasePool, src/lib/db/index.ts)
  }
}

function withTenantTx<T>(tenantId: string, work: (tx: Tx) => Promise<T>, opts?: { snapshot?: boolean }): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
    return work(tx)
    // snapshot: one read-only view for every statement (repeatable read), for a page whose numbers must agree (Home, U·4).
  }, opts?.snapshot ? { isolationLevel: 'repeatable read', accessMode: 'read only' } : undefined)
}

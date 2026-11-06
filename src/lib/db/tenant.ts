import 'server-only'
import { sql } from 'drizzle-orm'
import { db, type Tx } from './index'

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

export async function withTenant<T>(tenantId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
    return work(tx)
  })
}

import type postgres from 'postgres'

// =============================================================================
// FILE: src/lib/db/one-per-connection.ts — OUTSIDE A TRANSACTION, NO QUERY SENT BEHIND ANOTHER ON A CONNECTION (2026-11-23).
//
// Admin › Partners hung to Vercel's 60 s limit. Supavisor's log for those requests shows their connections
// authenticated, then idle until the client closed them, while the page's queries waited: answers lost, not a slow
// statement (frata_admin's statement_timeout is 20 s). postgres.js pipelines a parameterless query onto a connection
// that is already running one once every connection in the pool is busy, and through Supavisor's transaction mode a
// pipelined answer can be lost. Admin › Partners sends the most reads at once (three counts, two lists, Today's sources,
// the layout's own) on Admin's two connections.
//
// The fix holds the pool's queries to its size: a query waits for a free slot instead of riding behind another. A query
// (`unsafe`, every drizzle query outside a transaction) holds a slot while it runs; a transaction (`begin`) holds one for
// its whole length. Inside a transaction postgres.js may still send parameterless statements behind one another on the
// transaction's own connection (speed review LOW-1); Supavisor keeps one server connection for a transaction's length. A
// transaction that waits on a pool read outside itself could wait for ever with every slot held by transactions, as it
// already could for a connection; nothing here does that (withTenant's work runs on its own tx). (postgres.js's own `max_pipeline: 0`
// would do it, but it also stops `begin` from claiming its connection: UNSAFE_TRANSACTION.)
// Proof: src/lib/db/__tests__/pipeline.int.test.ts counts queries in flight on the wire.
// =============================================================================

type Sql = ReturnType<typeof postgres>

export function onePerConnection<T extends Sql>(sql: T, max: number): T {
  let running = 0
  const waiting: (() => void)[] = []
  const slot = async <R>(work: () => Promise<R>): Promise<R> => {
    // A freed slot passes straight to the longest waiter (security review): a newcomer never jumps the queue.
    if (running < max) running++
    else await new Promise<void>((r) => waiting.push(r))
    try { return await work() } finally { const next = waiting.shift(); if (next) next(); else running-- }
  }
  const unsafe = sql.unsafe.bind(sql)
  const held = ((query: string, params?: unknown[], options?: object) => {
    // postgres.js runs a query when it is awaited, so building it here sends nothing yet.
    const pending = unsafe(query, params as never, options as never)
    // postgres.js's own `begin` sends "begin" this way to claim a connection for the transaction: never held.
    if (options && 'onexecute' in options) return pending
    let values = false, once: Promise<unknown> | null = null
    const run = () => (once ??= slot(() => (values ? pending.values() : pending) as unknown as Promise<unknown>))
    const q = {
      values() { values = true; return q },
      then<A, B>(ok?: ((v: unknown) => A | PromiseLike<A>) | null, no?: ((e: unknown) => B | PromiseLike<B>) | null) { return run().then(ok, no) },
      catch<B>(no?: ((e: unknown) => B | PromiseLike<B>) | null) { return run().catch(no) },
      finally(f?: (() => void) | null) { return run().finally(f) },
    }
    return q
  }) as unknown as T['unsafe']
  sql.unsafe = held
  // A transaction holds a connection for its length, so it holds a slot too (tenancy review LOW): otherwise held reads
  // could still ride behind a query on the connection the transaction left them. Its own "begin" passes through above.
  const begin = sql.begin.bind(sql) as (...a: unknown[]) => Promise<unknown>
  sql.begin = ((...a: unknown[]) => slot(() => begin(...a))) as unknown as T['begin']
  return sql
}

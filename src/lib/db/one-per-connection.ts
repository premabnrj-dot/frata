import type postgres from 'postgres'

// =============================================================================
// FILE: src/lib/db/one-per-connection.ts — NO QUERY SENT BEHIND ANOTHER ON A CONNECTION (2026-11-23).
//
// Admin › Partners hung to Vercel's 60 s limit. Supavisor's log for those requests shows their connections
// authenticated, then idle until the client closed them, while the page's queries waited: answers lost, not a slow
// statement (frata_admin's statement_timeout is 20 s). postgres.js pipelines a parameterless query onto a connection
// that is already running one once every connection in the pool is busy, and through Supavisor's transaction mode a
// pipelined answer can be lost. Admin › Partners sends the most reads at once (three counts, two lists, Today's sources,
// the layout's own) on Admin's two connections.
//
// The fix holds the pool's queries to its size: a query waits for a free slot instead of riding behind another. Only
// `unsafe` (every drizzle query outside a transaction) is held; `begin` keeps its own connection, and the queries inside
// a transaction run on that connection, one after another, as they always did. (postgres.js's own `max_pipeline: 0`
// would do it, but it also stops `begin` from claiming its connection: UNSAFE_TRANSACTION.)
// Proof: src/lib/db/__tests__/pipeline.int.test.ts counts queries in flight on the wire.
// =============================================================================

type Sql = ReturnType<typeof postgres>

export function onePerConnection<T extends Sql>(sql: T, max: number): T {
  let running = 0
  const waiting: (() => void)[] = []
  const slot = async <R>(work: () => Promise<R>): Promise<R> => {
    while (running >= max) await new Promise<void>((r) => waiting.push(r))
    running++
    try { return await work() } finally { running--; waiting.shift()?.() }
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
  return sql
}

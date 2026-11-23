// Admin › Partners hung to Vercel's 60 s limit (production, 2026-11-23 17:16–17:19 UTC; first seen 7 Nov): Supavisor's log
// shows the request's connections authenticated, then idle until the client closed them, while the page's queries waited.
// postgres.js pipelines up to `max_pipeline` (default 100) queries on one connection without waiting for each answer, and
// Supavisor's transaction mode can hand a pipelined query's answer to no one. The page that sends the most queries at once
// (Admin › Partners: three counts, two lists, Today's sources, the layout's own) hung. Every pool sends one query at a time
// (onePerConnection, src/lib/db/one-per-connection.ts). This proves it on the wire: a proxy between postgres.js and Postgres counts queries in flight on
// one connection (Syncs sent minus ReadyForQuery received). Skipped unless INT_DB_HOST is set.
import { describe, expect, it } from 'vitest'
import { createServer, connect, type Socket } from 'node:net'
import { sql } from 'drizzle-orm'

const host = process.env.INT_DB_HOST

/** A proxy to Postgres that records the most queries ever in flight on one connection. */
async function proxy(target: string) {
  const [h, p] = target.split(':')
  let most = 0
  const server = createServer((client: Socket) => {
    const up = connect(Number(p), h!)
    let inFlight = 0, started = false, buf = Buffer.alloc(0), ready = 0
    client.on('data', (d) => {
      up.write(d)
      buf = Buffer.concat([buf, d])
      while (true) {
        if (!started) { if (buf.length < 4) break; const n = buf.readInt32BE(0); if (buf.length < n) break; buf = buf.subarray(n); started = true; continue }
        if (buf.length < 5) break
        const n = buf.readInt32BE(1); if (buf.length < n + 1) break
        if (buf[0] === 0x53 /* S: Sync */ || buf[0] === 0x51 /* Q: simple query */) { inFlight++; most = Math.max(most, inFlight) }
        buf = buf.subarray(n + 1)
      }
    })
    let down = Buffer.alloc(0)
    up.on('data', (d) => {
      client.write(d)
      down = Buffer.concat([down, d])
      while (down.length >= 5) {
        const n = down.readInt32BE(1); if (down.length < n + 1) break
        if (down[0] === 0x5a /* Z: ReadyForQuery */) { if (ready++ > 0) inFlight = Math.max(0, inFlight - 1) }
        down = down.subarray(n + 1)
      }
    })
    client.on('close', () => up.destroy()); up.on('close', () => client.destroy())
    client.on('error', () => up.destroy()); up.on('error', () => client.destroy())
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { port: (server.address() as { port: number }).port, most: () => most, close: () => new Promise<void>((r) => server.close(() => r())) }
}

describe.skipIf(!host)('no query sent behind another on a pooled connection', () => {
  const open = async (gated: boolean) => {
    const postgres = (await import('postgres')).default
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { POOL } = await import('../index')
    const { onePerConnection } = await import('../one-per-connection')
    const px = await proxy(host!)
    const raw = postgres(`postgresql://postgres@127.0.0.1:${px.port}/${process.env.INT_DB_NAME ?? 'postgres'}`, { ...POOL, max: 2, idle_timeout: 5, onnotice: () => {} })
    return { px, raw, db: drizzle(gated ? onePerConnection(raw, 2) : raw) }
  }
  // Admin › Partners' shape: a dozen reads at once on a pool of two, with no parameters (its three partner counts have
  // none; postgres.js describes a parameterised query first and never pipelines past it).
  const twelve = (db: Awaited<ReturnType<typeof open>>['db']) => Promise.all(Array.from({ length: 12 }, () => db.execute(sql`select pg_sleep(0.02)`)))

  it('without the gate postgres.js pipelines (the failure); with it, one query in flight a connection', async () => {
    const bare = await open(false)
    try { await twelve(bare.db); expect(bare.px.most()).toBeGreaterThan(1) } finally { await bare.raw.end({ timeout: 1 }); await bare.px.close() }
    const held = await open(true)
    try { await twelve(held.db); expect(held.px.most()).toBe(1) } finally { await held.raw.end({ timeout: 1 }); await held.px.close() }
  }, 30_000)

  it('a transaction still claims its connection and runs beside held reads; results and errors come back as before', async () => {
    const { px, raw, db } = await open(true)
    try {
      const [tx, reads] = await Promise.all([
        // Held open while the reads run: it holds one of the two connections, so the reads share the other one at a time.
        db.transaction(async (t) => { await t.execute(sql`select pg_sleep(0.2)`); return (await t.execute(sql`select 2 as n`))[0] }),
        // Parameterless, as the counter sees them (a parameterised query's first message has no Sync).
        Promise.all(Array.from({ length: 6 }, () => db.execute(sql`select 7 as n, pg_sleep(0.02)`))),
      ])
      expect(tx).toEqual({ n: 2 })
      expect(reads.map((r) => r[0]?.n)).toEqual([7, 7, 7, 7, 7, 7])
      await expect(db.execute(sql`select * from no_such_table`)).rejects.toThrow()
      expect(px.most()).toBe(1)
    } finally { await raw.end({ timeout: 1 }); await px.close() }
  }, 30_000)
})

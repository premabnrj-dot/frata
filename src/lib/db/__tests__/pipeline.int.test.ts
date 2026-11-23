// Admin › Partners hung to Vercel's 60 s limit (production, 2026-11-23 17:16–17:19 UTC; first seen 7 Nov): Supavisor's log
// shows the request's connections authenticated, then idle until the client closed them, while the page's queries waited.
// postgres.js pipelines up to `max_pipeline` (default 100) queries on one connection without waiting for each answer, and
// Supavisor's transaction mode can hand a pipelined query's answer to no one. The page that sends the most queries at once
// (Admin › Partners: three counts, two lists, Today's sources, the layout's own) hung. Every pool sends one query at a time
// (POOL.max_pipeline = 0: none behind the one running). This proves it on the wire: a proxy between postgres.js and Postgres counts queries in flight on
// one connection (Syncs sent minus ReadyForQuery received). Skipped unless INT_DB_HOST is set.
import { describe, expect, it } from 'vitest'
import { createServer, connect, type Socket } from 'node:net'

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

describe.skipIf(!host)('one query at a time on a pooled connection', () => {
  it('the pool never pipelines, however many queries a page sends at once', async () => {
    const postgres = (await import('postgres')).default
    const { POOL } = await import('../index')
    const px = await proxy(host!)
    const sql = postgres(`postgresql://postgres@127.0.0.1:${px.port}/${process.env.INT_DB_NAME ?? 'postgres'}`, { ...POOL, max: 2, idle_timeout: 5, onnotice: () => {} })
    try {
      // Admin › Partners' shape: a dozen reads at once on a pool of two, with no parameters (its three partner counts
      // have none; postgres.js describes a parameterised query first and never pipelines past it).
      await Promise.all(Array.from({ length: 12 }, () => sql`select pg_sleep(0.02)`))
      expect(px.most()).toBe(1)
    } finally {
      await sql.end({ timeout: 1 })
      await px.close()
    }
  }, 30_000)
})

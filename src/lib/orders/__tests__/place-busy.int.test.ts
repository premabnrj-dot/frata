// A flash drop on a real Postgres (tenant A of the proof): a shop places at most PLACE_SLOTS orders at once across
// every instance; the next shopper reads "busy" at once instead of holding a pooled connection (speed review
// 2026-11-11). Skipped unless INT_DB_HOST is set (CI). Writes nothing.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('placing orders at a flash drop', () => {
  it('the ninth placement at once is refused as busy, at once, and a slot frees when one ends', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { default: postgres } = await import('postgres')
    const { placeOrder, PLACE_SLOTS } = await import('@/lib/orders/place')
    // Other instances' placements, each holding one slot inside its own open transaction.
    const others = postgres(process.env.DATABASE_URL, { max: PLACE_SLOTS })
    const release: (() => void)[] = []
    const held = Array.from({ length: PLACE_SLOTS }, (_, s) => new Promise<void>((ready) => {
      void others.begin(async (sql) => {
        await sql`select pg_advisory_xact_lock(hashtextextended(${A + ':place'}, ${s}))`
        ready()
        await new Promise<void>((r) => release.push(r))
      })
    }))
    await Promise.all(held)
    const input = { host: 'a.test', idempotencyKey: 'busy-test', bag: [], address: {}, method: 'cod', expectedTotal: 0, facts: {} } as unknown as Parameters<typeof placeOrder>[1]
    const t0 = Date.now()
    const busy = await placeOrder(A, input)
    expect(busy).toMatchObject({ kind: 'refused', status: 503 })
    expect(Date.now() - t0).toBeLessThan(1500)
    // One placement ends: the next shopper gets its slot (and goes on to the shop's own checks).
    release.shift()!()
    await new Promise((r) => setTimeout(r, 100))
    const next = await placeOrder(A, input)
    expect(next).not.toMatchObject({ status: 503 })
    for (const r of release) r()
    await others.end()
  })
})

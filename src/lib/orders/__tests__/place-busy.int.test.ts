// A flash drop on a real Postgres (a throwaway shop made from shop A of the proof, so the other int tests running on A at
// the same time neither hold its slots nor add offers to it; skipped unless INT_DB_HOST is set, as in CI): a shop places at
// most PLACE_SLOTS orders at once across every instance, and a placement waits at most 2 s for a row lock; past either,
// the shopper reads "busy" and no order is written (speed review 2026-11-11). A try whose order was already placed finds
// that order even while every slot is taken. The throwaway shop and its one test order are left in the proof database.
import { describe, expect, it } from 'vitest'

const HOST = 'kesar-studio.frata.test'
const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'
const address = (phone: string) => ({ name: 'Int Shopper', phone, addressLine: '12 MG Road', area: 'Vaishali Nagar', landmark: '', pincode: '302021', city: 'Jaipur', state: 'Rajasthan' as const, email: null })

describe.skipIf(!host)('placing orders at a flash drop', () => {
  it('busy past the slots and past a 2 s lock wait, nothing written; a placed order is found while busy', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { default: postgres } = await import('postgres')
    const { withTenant } = await import('@/lib/db/tenant')
    const { products, variants } = await import('@/lib/db/schema-catalogue')
    const { orders } = await import('@/lib/db/schema-orders')
    const { placeOrder, PLACE_SLOTS } = await import('@/lib/orders/place')
    const { quoteData } = await import('@/lib/queries/checkout')
    const { quote } = await import('@/domains/checkout/quote')
    const { and, eq } = await import('drizzle-orm')

    const stamp = Date.now()
    // The throwaway shop: shop A's settings, published, pay on delivery on, no offers of its own.
    const su = postgres(`postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const [{ id: A }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-busy-' + stamp}, 'Int busy') returning id`
    await su`create temp table busy_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
    await su`update busy_shop set tenant_id = ${A}, published_at = now(), cod_on = true, cod_min = 0, cod_max = 0, cod_charge = 4900, shipping_flat = 0, free_shipping_above = 0, cod_blocked_pincodes = '{}'`
    await su`insert into shop_settings select * from busy_shop`
    await su.end()
    const made = await withTenant(A, async (tx) => {
      const [p] = await tx.insert(products).values({ tenantId: A, handle: `int-busy-${stamp}`, title: 'Int drop tee', options: ['Size'], status: 'active', hsn: '6109' }).returning({ id: products.id })
      const [v] = await tx.insert(variants).values({ tenantId: A, productId: p!.id, optionValues: ['M'], price: 99900, stock: 10 }).returning({ id: variants.id })
      return { product: p!.id, variant: v!.id }
    })
    // Other instances' placements, on two connections (the int tests share one Postgres): one holds slots as session
    // locks (they conflict with the transaction-level slot locks) and frees them one by one; one holds the drop's stock row.
    const others = postgres(process.env.DATABASE_URL, { max: 2 })
    const slots = await others.reserve()
    const slot = (s: number) => others`select hashtextextended(${A + ':place'}, ${s}) as k`.then((r) => r[0]!.k as string)
    const takeAll = async () => { for (let s = 0; s < PLACE_SLOTS; s++) await slots`select pg_advisory_lock(${await slot(s)}::bigint)` }
    const free = async (s: number) => { await slots`select pg_advisory_unlock(${await slot(s)}::bigint)` }
    const freeAll = async () => { await slots`select pg_advisory_unlock_all()` }
    const row = { release: () => {} }
    const key = (n: number) => `busy${stamp}${n}`.padEnd(22, 'x').slice(0, 22)
    const orderFor = (k: string) => withTenant(A, async (tx) => (await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.tenantId, A), eq(orders.idempotencyKey, k))))[0])
    try {
      const bag = [{ variantId: made.variant, qty: 1 }]
      const now = new Date()
      const data = await quoteData(A, [made.variant], now, null, HOST)
      const total = quote(bag, data.rows, data.shop!, now, '302021', { offers: data.offers }).cod.total
      const input = (n: number) => ({ host: HOST, idempotencyKey: key(n), bag, address: address(`98291${String(stamp).slice(-4)}${n}`), method: 'cod' as const, expectedTotal: total, facts: {} })

      // 1. Every slot taken: the next shopper is refused at once, and nothing is written.
      await takeAll()
      let t0 = Date.now()
      expect(await placeOrder(A, input(1))).toMatchObject({ kind: 'refused', status: 503 })
      expect(Date.now() - t0).toBeLessThan(1500)
      expect(await orderFor(key(1))).toBeUndefined()

      // 2. A slot frees: the same try (same key) places the order.
      await free(0)
      const first = await placeOrder(A, input(1))
      expect(first.kind).toBe('placed')

      // 3. Every slot taken again: the same try (its response lost) finds its order, never "busy, nothing was charged".
      await slots`select pg_advisory_lock(${await slot(0)}::bigint)`
      expect(await placeOrder(A, input(1))).toMatchObject({ kind: 'placed', number: first.kind === 'placed' ? first.number : -1 })
      await freeAll()

      // 4. The drop's stock row held by a long placement elsewhere: a new shopper waits ≤ 2 s, then reads busy; no order.
      await new Promise<void>((ready) => {
        void others.begin(async (sql) => {
          await sql`select set_config('app.tenant_id', ${A}, true)`
          await sql`select id from variants where tenant_id = ${A} and id = ${made.variant} for update`
          ready()
          await new Promise<void>((r) => { row.release = r })
        })
      })
      t0 = Date.now()
      expect(await placeOrder(A, input(2))).toMatchObject({ kind: 'refused', status: 503 })
      expect(Date.now() - t0).toBeGreaterThanOrEqual(1900)
      expect(Date.now() - t0).toBeLessThan(4000)
      expect(await orderFor(key(2))).toBeUndefined()
    } finally {
      row.release()
      await freeAll().catch(() => {})
      slots.release()
      await others.end()
    }
  }, 20_000)
})

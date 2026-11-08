// Erasing abandoned online orders (src/lib/orders/erase.ts) on a real Postgres, tenant A of the proof.
// Skipped unless INT_DB_HOST is set (CI). It commits (withTenant is its own transaction) on far-numbered rows.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('erasing abandoned online orders', () => {
  it('blanks the shopper on online orders never paid after 90 days, and nothing else', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders } = await import('@/lib/db/schema-orders')
    const { eraseAbandoned } = await import('@/lib/orders/erase')
    const { shopsToErase } = await import('@/lib/db/platform')
    const { and, eq, gte } = await import('drizzle-orm')
    const now = new Date(), old = new Date(now.getTime() - 100 * 86_400_000)
    const base = 930_000 + Math.floor(Math.random() * 60_000)
    const who = { customerName: 'Ananya Sharma', phone: '9829043210', addressLine: 'B-14, Tilak Marg', area: 'C-Scheme' }
    await withTenant(A, (tx) => tx.insert(orders).values([
      { tenantId: A, number: base, paymentMethod: 'prepaid', placedAt: old, ...who, checkout: { attribution: { utm_source: 'instagram', fbclid: 'IwAR1', gclid: 'Cj0', ref_host: 'l.instagram.com', fbc: 'fb.1.2.3' } } }, // abandoned, old: erased
      { tenantId: A, number: base + 1, paymentMethod: 'prepaid', placedAt: old, paidAt: old, ...who, checkout: { attribution: { fbclid: 'IwAR2' } } }, // paid: kept
      { tenantId: A, number: base + 2, paymentMethod: 'cod', placedAt: old, ...who },                       // COD: kept
      { tenantId: A, number: base + 3, paymentMethod: 'prepaid', placedAt: now, ...who },                   // abandoned, recent: kept
    ]))
    expect(await shopsToErase(new Date(now.getTime() - 90 * 86_400_000))).toContain(A)
    expect(await eraseAbandoned(A, now)).toBeGreaterThanOrEqual(1)
    const rows = await withTenant(A, (tx) => tx.select({ n: orders.number, name: orders.customerName, area: orders.area, erased: orders.erasedAt }).from(orders)
      .where(and(eq(orders.tenantId, A), gte(orders.number, base))).orderBy(orders.number))
    expect(rows.slice(0, 4).map((r) => [r.n - base, r.name, r.area, !!r.erased])).toEqual([
      [0, '', '', true], [1, 'Ananya Sharma', 'C-Scheme', false], [2, 'Ananya Sharma', 'C-Scheme', false], [3, 'Ananya Sharma', 'C-Scheme', false],
    ])
    // The click ids and the referring site go with the details; the merchant's own utm tags stay. A paid order keeps all.
    const att = await withTenant(A, (tx) => tx.select({ n: orders.number, c: orders.checkout }).from(orders).where(and(eq(orders.tenantId, A), gte(orders.number, base))).orderBy(orders.number))
    expect((att[0]!.c as { attribution: unknown }).attribution).toEqual({ utm_source: 'instagram' })
    expect((att[1]!.c as { attribution: unknown }).attribution).toEqual({ fbclid: 'IwAR2' })
  })
})

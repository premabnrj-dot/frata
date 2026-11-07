// markPaid on a real Postgres (tenant A of the proof; skipped unless INT_DB_HOST is set, as in CI). A capture
// after a switch to COD takes the COD fee off — before packing only: a packed order's invoice is issued and is
// never rewritten (unit-economics review 2026-11-07). Everything it writes is rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('a capture after a switch to COD', () => {
  it('re-prices an unpacked order; leaves a packed one (and its invoice) exactly as issued', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { withTenant } = await import('@/lib/db/tenant')
    const { orders, orderLines } = await import('@/lib/db/schema-orders')
    const { markPaid } = await import('@/lib/orders/payment')
    const { eq } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      const make = async (number: number, packed: boolean) => {
        const [o] = await tx.insert(orders).values({ tenantId: A, number, paymentMethod: 'prepaid', placedAt: new Date(Date.now() - 3_600_000),
          switchedToCodAt: new Date(Date.now() - 3_000_000), subtotal: 249000, codCharge: 4900, gstTotal: 11857 + 233, total: 253900,
          ...(packed ? { confirmedAt: new Date(Date.now() - 2_000_000), packedAt: new Date(Date.now() - 1_000_000), invoiceNumber: `INT/26-27/${String(number).slice(-5)}` } : {}) }).returning({ id: orders.id })
        await tx.insert(orderLines).values({ tenantId: A, orderId: o!.id, title: 'Kurta', qty: 1, unitPrice: 249000, taxableValue: 237143, gst: 11857, gstBps: 500, kind: 'in_stock', position: 0,
          chargeTaxable: 4667, chargeGst: 233, stockTakenAt: new Date() })
        return o!.id
      }
      const read = async (id: string) => (await tx.select({ cod: orders.codCharge, total: orders.total, gst: orders.gstTotal }).from(orders).where(eq(orders.id, id)))[0]!
      const unpacked = await make(920_001, false), packed = await make(920_002, true)

      expect(await markPaid(tx, { id: unpacked, tenantId: A }, { paymentId: 'pay_int_1' })).toBe('paid')
      expect(await read(unpacked)).toMatchObject({ cod: 0, total: 249000 }) // what the shopper paid online

      expect(await markPaid(tx, { id: packed, tenantId: A }, { paymentId: 'pay_int_2' })).toBe('paid')
      expect(await read(packed)).toEqual({ cod: 4900, total: 253900, gst: 12090 }) // the issued invoice's figures, untouched
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})

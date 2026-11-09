// "Pair it with" (src/lib/catalogue/extras.ts savePairs) on a real Postgres, tenant A of the proof (scripts/verify/
// tenancy.sql seeds B's product). Skipped unless INT_DB_HOST is set (CI). Rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const B_PRODUCT = 'eeeeeeee-0000-0000-0000-00000000000b'

describe.skipIf(!host)('saving pairings', () => {
  it('saves this shop\'s pieces in order, refuses another shop\'s, a missing one and itself; replaces on the next save', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { products, productPairs } = await import('@/lib/db/schema-catalogue')
    const { savePairs } = await import('@/lib/catalogue/extras')
    const { asc, eq } = await import('drizzle-orm')
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      const [p, x, y] = await tx.insert(products).values(['p', 'x', 'y'].map((h) => ({ tenantId: A, handle: `int-pair-${h}-${Date.now()}`, title: h }))).returning({ id: products.id })
      const pairsOf = async () => (await tx.select({ id: productPairs.pairedId }).from(productPairs).where(eq(productPairs.productId, p!.id)).orderBy(asc(productPairs.position))).map((r) => r.id)
      expect(await savePairs(tx, A, p!.id, [y!.id, x!.id])).toBe(true)
      expect(await pairsOf()).toEqual([y!.id, x!.id])
      expect(await savePairs(tx, A, p!.id, [x!.id, B_PRODUCT])).toBe(false)
      expect(await savePairs(tx, A, p!.id, ['99999999-9999-4999-8999-999999999999'])).toBe(false)
      expect(await savePairs(tx, A, p!.id, [p!.id])).toBe(false)
      expect(await pairsOf()).toEqual([y!.id, x!.id]) // a refusal changes nothing
      expect(await savePairs(tx, A, p!.id, [])).toBe(true)
      expect(await pairsOf()).toEqual([])
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})

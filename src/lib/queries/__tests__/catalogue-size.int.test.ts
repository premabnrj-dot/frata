// Speed review P1 (2026-11-08) on a real Postgres: the shop's cached catalogue at the list's limit — 600 products,
// 5 sizes, 5 photos and 2 colours each, with a shop-wide product offer — stays under 1 MB. Next refuses to cache an
// entry over 2 MB and says nothing: every shop page would then read Postgres on every render. Tenant A of the proof
// (scripts/verify/tenancy.sh); skipped unless INT_DB_HOST is set. The rows are committed (the loader opens its own
// transaction) and deleted after.
import { afterAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const ME = '99999999-9999-9999-9999-999999999999'
const PREFIX = 'size-proof-'
const BUDGET = 1_000_000

describe.skipIf(!host)('the cached catalogue', () => {
  let clean: (() => Promise<void>) | null = null
  afterAll(async () => { await clean?.() })

  it(`stays under ${BUDGET} bytes at 600 products`, async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { products, variants, productImages, productColours, productAttributes } = await import('@/lib/db/schema-catalogue')
    const { discounts } = await import('@/lib/db/schema-discounts')
    const { sql, like, and, eq } = await import('drizzle-orm')
    const { catalogueEntry } = await import('@/lib/queries/storefront')
    const sizes = ['XS', 'S', 'M', 'L', 'XL']
    clean = () => withTenant(A, async (tx) => {
      // An offer is never deleted, only ended.
      await tx.update(discounts).set({ endedAt: new Date() }).where(and(eq(discounts.tenantId, A), like(discounts.title, `${PREFIX}%`), sql`${discounts.endedAt} is null`))
      const ids = sql`(select id from products where tenant_id = ${A} and handle like ${PREFIX + '%'})`
      for (const t of [variants, productImages, productColours, productAttributes]) await tx.delete(t).where(sql`tenant_id = ${A} and product_id in ${ids}`)
      await tx.delete(products).where(and(eq(products.tenantId, A), like(products.handle, `${PREFIX}%`)))
    })
    await clean()
    await withTenant(A, async (tx) => {
      const ps = await tx.insert(products).values(Array.from({ length: 600 }, (_, i) => ({ tenantId: A, handle: `${PREFIX}${i}`, title: `Handwoven Chanderi kurta set ${i}`,
        status: 'active', publishedAt: new Date(), options: ['Size', 'Colour'], tags: ['festive', 'cotton'], taxonomyCategory: 'aa-1-23-7' }))).returning({ id: products.id })
      for (let k = 0; k < ps.length; k += 100) {
        const chunk = ps.slice(k, k + 100)
        await tx.insert(variants).values(chunk.flatMap((p) => sizes.map((s, j) => ({ tenantId: A, productId: p.id, optionValues: [s, 'Rani'], sku: `KUR-${p.id.slice(0, 8)}-${s}`, price: 249900, compareAt: 349900, stock: 7, position: j }))))
        await tx.insert(productImages).values(chunk.flatMap((p) => [0, 1, 2, 3, 4].map((j) => ({ tenantId: A, productId: p.id, base: `https://abc.public.blob.vercel-storage.com/tenants/${A}/products/${crypto.randomUUID()}`, widths: [400, 800, 1200, 1600], width: 1600, height: 2000, position: j, optionValue: j < 2 ? 'Rani' : null, alt: 'Model wearing the kurta set, front' }))))
        await tx.insert(productColours).values(chunk.flatMap((p) => [{ tenantId: A, productId: p.id, value: 'Rani', family: 'pink', hex: '#d61f69' }, { tenantId: A, productId: p.id, value: 'Neel', family: 'blue', hex: '#23307a' }]))
        await tx.insert(productAttributes).values(chunk.flatMap((p) => [{ tenantId: A, productId: p.id, attribute: 'fabric', values: ['cotton'] }, { tenantId: A, productId: p.id, attribute: 'occasion', values: ['festive', 'wedding'] }]))
      }
      await tx.insert(discounts).values({ tenantId: A, title: `${PREFIX}festive`, style: 'product_off', percentBps: 1000, targets: 'all', listed: true, startsAt: new Date(Date.now() - 86_400_000), startedAt: new Date(Date.now() - 86_400_000), startedBy: ME, createdBy: ME })
    })
    const entry = await catalogueEntry(A)
    const bytes = Buffer.byteLength(JSON.stringify(entry))
    console.log(`[catalogue-size] ${entry.products.length} products → ${bytes} bytes`, process.env.SHOW ? JSON.stringify(entry.products[0]) : "")
    expect(entry.products.length).toBeGreaterThanOrEqual(600)
    expect(bytes).toBeLessThan(BUDGET)
  }, 120_000)
})

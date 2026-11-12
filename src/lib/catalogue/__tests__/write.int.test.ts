// The chunk writer (src/lib/catalogue/write.ts writeProducts) making NEW products, as the import will, on a real
// Postgres in the proof's shop A, rolled back: free handles past the shop's own and its old addresses, never two alike
// in a batch; default SKUs unique in the shop; costs only when seen; a refusal writes nothing; the caller's lock_timeout
// put back. (The editor's path, existing products, is save-product.int.test.ts.) With SPEED=1 it also EXPLAINs the
// handle and SKU reads in a throwaway shop at 10× the live catalogue limit (6,000 products, 18,000 sizes).
// Skipped unless INT_DB_HOST is set.
import { describe, expect, it } from 'vitest'
import postgres from 'postgres'
import type { CleanVariant } from '@/domains/catalogue/product-form'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111' // "Proof A": no order prefix, so SKUs start PR-

const size = (values: string[], v: Partial<CleanVariant> = {}): CleanVariant => ({
  values, price: 129900, compareAt: null, unitCost: 45000, stock: 3, sku: null, gtin: null, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, ...v,
})
const sized = (title: string, handle: string, v: Partial<CleanVariant>[] = [{}, {}]) =>
  ({ title, handle, options: [{ name: 'Size', values: ['S', 'M'].slice(0, v.length) }], variants: v.map((x, i) => size([['S', 'M'][i]!], x)) })

describe.skipIf(!host)('writing new products in one batch', () => {
  it('frees handles and SKUs in the shop and the batch, writes no cost unseen, refuses before writing, restores lock_timeout', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const { productHandleHistory, products, variants } = await import('@/lib/db/schema-catalogue')
    const { writeProducts } = await import('@/lib/catalogue/write')
    const { and, asc, eq, inArray, like, sql } = await import('drizzle-orm')
    const b = `int-write-${Date.now()}`
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      const [old] = await tx.insert(products).values({ tenantId: A, handle: b, title: 'Int write' }).returning({ id: products.id })
      await tx.insert(variants).values({ tenantId: A, productId: old!.id, optionValues: [], price: 100, sku: 'pr-intwri-s' })
      await tx.insert(productHandleHistory).values({ tenantId: A, handle: `${b}-2`, productId: old!.id })
      const timeout = async () => (await tx.execute<{ t: string }>(sql`select current_setting('lock_timeout') as t`))[0]!.t
      await tx.execute(sql`set local lock_timeout = '7s'`)

      const w = await writeProducts(tx, A, [sized('Int write', b), sized('Int write', b, [{}]), sized(b, '', [{ sku: 'INT-W-TYPED' }])], { costs: false })
      expect(w).toMatchObject({ ok: true, products: [{ handle: `${b}-3` }, { handle: `${b}-4` }, { handle: `${b}-5` }] })
      if (!w.ok) throw new Error(w.error)
      expect(await timeout()).toBe('7s')
      const rows = await tx.select({ p: variants.productId, values: variants.optionValues, sku: variants.sku, cost: variants.unitCost, position: variants.position, status: products.status })
        .from(variants).innerJoin(products, and(eq(products.tenantId, variants.tenantId), eq(products.id, variants.productId)))
        .where(and(eq(variants.tenantId, A), inArray(variants.productId, w.products.map((p) => p.id)))).orderBy(asc(products.handle), asc(variants.position))
      expect(rows.map((r) => [w.products.findIndex((p) => p.id === r.p), r.values, r.sku, r.cost, r.position, r.status])).toEqual([
        [0, ['S'], 'PR-INTWRI-S-2', null, 0, 'draft'], [0, ['M'], 'PR-INTWRI-M', null, 1, 'draft'],
        [1, ['S'], 'PR-INTWRI-S-3', null, 0, 'draft'],
        [2, ['S'], 'INT-W-TYPED', null, 0, 'draft'],
      ])

      // Refused before anything is written: a SKU typed on two of the batch, one another product has (any case), a barcode twice.
      const count = async () => (await tx.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.tenantId, A), like(products.handle, `${b}%`))))[0]!.n
      expect(await writeProducts(tx, A, [sized('X', b, [{ sku: 'INT-W-1' }]), sized('Y', b, [{ sku: 'int-w-1' }])], { costs: true })).toEqual({ ok: false, draft: 1, error: 'SKU int-w-1 is on two of these products.' })
      expect(await writeProducts(tx, A, [sized('X', b), sized('Y', b, [{ sku: 'int-w-typed' }])], { costs: true })).toEqual({ ok: false, draft: 1, error: 'SKU int-w-typed is already used by another product in your shop.' })
      expect(await writeProducts(tx, A, [sized('X', b, [{ gtin: '4006381333931' }]), sized('Y', b, [{ gtin: '4006381333931' }])], { costs: true })).toMatchObject({ ok: false, draft: 1 })
      expect(await count()).toBe(4)

      // Seen costs are written; a Hindi name has an address in Latin letters.
      const seen = await writeProducts(tx, A, [sized(`लिनन कुर्ता ${b}`, '', [{}])], { costs: true })
      if (!seen.ok) throw new Error(seen.error)
      expect(seen.products[0]!.handle).toBe(`linan-kurta-${b}`)
      expect((await tx.select({ cost: variants.unitCost }).from(variants).where(and(eq(variants.tenantId, A), eq(variants.productId, seen.products[0]!.id)))).map((r) => r.cost)).toEqual([45000])
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })

  it.skipIf(!process.env.SPEED)('reads handles and SKUs for a 200-product chunk in under 10 ms at 10× the catalogue limit', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { db } = await import('@/lib/db')
    const { takenHandles, undigit } = await import('@/lib/catalogue/handles')
    const { takenSkus } = await import('@/lib/catalogue/write')
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const ROLLBACK = new Error('rollback')
    const ms: Record<string, number> = {}
    try {
      await su.begin(async (q) => {
        const [{ id: T }] = await q<[{ id: string }]>`insert into tenants (slug, name) values (${'int-speed-' + Date.now()}, 'Int speed') returning id`
        await q`insert into products (tenant_id, handle, title) select ${T}, 'kurta-' || n || case when n % 3 = 0 then '-' || (n % 7 + 2) else '' end, 'Kurta ' || n from generate_series(1, 6000) n`
        await q`insert into variants (tenant_id, product_id, option_values, price, sku)
          select p.tenant_id, p.id, array[s], 129900, 'KS-KUR' || substr(p.handle, 7) || '-' || s from products p, unnest(array['S','M','L']) s where p.tenant_id = ${T}`
        await q`analyze products`; await q`analyze variants`
        await q`set local role frata_app`
        await q`select set_config('app.tenant_id', ${T}, true)`
        // The best of five EXPLAIN ANALYZE runs: the plan's cost, not this machine's jitter (each run is printed).
        const explain = async (name: string, built: { toSQL(): { sql: string; params: unknown[] } }) => {
          const { sql: text, params } = built.toSQL()
          const runs: number[] = []
          for (let i = 0; i < 5; i++) {
            const [{ 'QUERY PLAN': plan }] = await q.unsafe<[{ 'QUERY PLAN': unknown }]>(`explain (analyze, format json) ${text}`, params as never[])
            runs.push((plan as { 'Execution Time': number }[])[0]!['Execution Time'])
            if (process.env.SPEED === 'plan' && !i) console.info(name, JSON.stringify((plan as { Plan: unknown }[])[0]!.Plan, null, 1))
          }
          console.info(`[write speed] ${name} at 10×, ms:`, runs.join(' '))
          ms[name] = Math.min(...runs)
        }
        const chunk = Array.from({ length: 200 }, (_, i) => `kurta-${i * 30 + 1}`)
        const tx = db() as unknown as Parameters<typeof takenHandles>[0]
        await explain('handles', takenHandles(tx, T, chunk.flatMap((h) => [undigit(h), `${h}-`])))
        const skus = chunk.flatMap((h) => ['S', 'M', 'L'].map((s) => `KS-KUR${h.slice(6)}-${s}`))
        await explain('skus', takenSkus(tx, T, [], [...new Set(skus.flatMap((s) => [undigit(s), `${s}-`]))]))
        throw ROLLBACK
      })
    } catch (e) { if (e !== ROLLBACK) throw e } finally { await su.end() }
    expect(ms.handles).toBeLessThan(10)
    expect(ms.skus).toBeLessThan(10)
  })
})

// The editor's save (saveProduct, src/app/(console)/console/products/actions.ts) on a real Postgres, pinned before the
// import's chunk writer shares its rules (plan 2026-11-12-product-import PI·0 · 1): SKUs unique in the shop (any case,
// a default made and suffixed when blank, two sizes may swap theirs), a barcode on another product refused, a size
// removed and added back is the same row (archived while ordered, refused with pre-orders to pack), every field of a
// kept size written, the cost of goods written only by whoever sees it, and a drop's checkout holding the sizes told
// in words with nothing written. The sign-in is faked (the member is the test's); the shop is a throwaway one made through ADMIN_URL and removed
// after. Skipped unless INT_DB_HOST is set.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import type { ProductInput, VariantInput } from '@/domains/catalogue/product-form'

const state = vi.hoisted(() => ({ tenantId: '', role: 'owner' as 'owner' | 'staff' }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async () => ({ ok: true, userId: '99999999-9999-4999-8999-999999999999', email: 'int@example.com', staffRole: null, all: [],
    membership: { tenantId: state.tenantId, tenantName: 'Int save', role: state.role, supportSessionId: null } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'
const EAN = '4006381333931', EAN2 = '8901234567890' // real check digits

const cell = (values: string[], v: Partial<VariantInput> = {}): VariantInput => ({ values, price: '1299', compareAt: '', cost: '', stock: '5', sku: '', gtin: '', ...v })
const input = (handle: string, sizes: string[], cells: VariantInput[]): ProductInput => ({
  title: `Int ${handle}`, description: '', typeId: null, modelHeight: '', modelSize: '', handle,
  options: sizes.length ? [{ name: 'Size', values: sizes }] : [], variants: cells,
})

/** The test's own reads and setup rows, as the app's role inside the shop's transaction. */
async function rows() {
  const { withTenant } = await import('@/lib/db/tenant')
  const { products, variants } = await import('@/lib/db/schema-catalogue')
  const { orders, orderLines } = await import('@/lib/db/schema-orders')
  const { and, asc, eq, isNull } = await import('drizzle-orm')
  return {
    /** A product as Products' "New product" leaves it: its sizes at no price, no SKUs. */
    product: (t: string, handle: string, sizes: string[][]) => withTenant(t, async (tx) => {
      const [p] = await tx.insert(products).values({ tenantId: t, handle, title: `Int ${handle}`, options: sizes[0]!.length ? ['Size'] : [], optionValues: sizes[0]!.length ? [sizes.map((s) => s[0]!)] : [] }).returning({ id: products.id })
      await tx.insert(variants).values(sizes.map((v, i) => ({ tenantId: t, productId: p!.id, optionValues: v, price: 0, position: i })))
      return p!.id
    }),
    variantsOf: (t: string, productId: string, withArchived = false) => withTenant(t, async (tx) => (await tx.select({
      id: variants.id, values: variants.optionValues, sku: variants.sku, gtin: variants.gtin, price: variants.price, unitCost: variants.unitCost, position: variants.position, archivedAt: variants.archivedAt,
    }).from(variants).where(and(eq(variants.tenantId, t), eq(variants.productId, productId), withArchived ? undefined : isNull(variants.archivedAt))).orderBy(asc(variants.position), asc(variants.createdAt)))
      .map(({ archivedAt, price, unitCost, ...v }) => ({ ...v, price: Number(price), unitCost: unitCost === null ? null : Number(unitCost), archived: archivedAt !== null }))),
    /** Everything a size's row holds that the editor writes, besides its SKU and price. */
    detailsOf: (t: string, productId: string) => withTenant(t, async (tx) => (await tx.select({
      values: variants.optionValues, stock: variants.stock, compareAt: variants.compareAt, whenOut: variants.whenOut, shipsBy: variants.shipsBy,
      leadMin: variants.leadMinDays, leadMax: variants.leadMaxDays, cap: variants.preorderCap, gtin: variants.gtin,
    }).from(variants).where(and(eq(variants.tenantId, t), eq(variants.productId, productId), isNull(variants.archivedAt))).orderBy(asc(variants.position)))
      .map(({ compareAt, ...v }) => ({ ...v, compareAt: compareAt === null ? null : Number(compareAt) }))),
    setStatus: (t: string, productId: string, status: 'active' | 'draft') => withTenant(t, (tx) => tx.update(products).set({ status }).where(and(eq(products.tenantId, t), eq(products.id, productId)))),
    versionOf: (t: string, productId: string) => withTenant(t, async (tx) => (await tx.select({ v: products.version }).from(products).where(and(eq(products.tenantId, t), eq(products.id, productId))))[0]!.v),
    /** One order for the size: from then on it is archived, never deleted. A pre-order still to pack: it can't go at all. */
    orderLineFor: (t: string, variantId: string, kind: 'in_stock' | 'preorder' = 'in_stock') => withTenant(t, async (tx) => {
      const [o] = await tx.insert(orders).values({ tenantId: t, number: 1 + Math.floor(Math.random() * 900_000), paymentMethod: 'cod', placedAt: new Date() }).returning({ id: orders.id })
      await tx.insert(orderLines).values({ tenantId: t, orderId: o!.id, variantId, title: 'L', qty: 1, unitPrice: 129900, taxableValue: 123714, kind, stockTakenAt: kind === 'in_stock' ? new Date() : null })
    }),
  }
}

describe.skipIf(!host)('saving a product (the editor)', () => {
  const su = host ? postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} }) : null
  let m: { save: typeof import('@/app/(console)/console/products/actions').saveProduct; db: Awaited<ReturnType<typeof rows>> }

  beforeAll(async () => {
    if (!su) return
    const [{ id }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-save-' + Date.now()}, 'Int save') returning id`
    state.tenantId = id
    await su`create temp table save_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
    await su`update save_shop set tenant_id = ${id}, order_prefix = 'KS'`
    await su`insert into shop_settings select * from save_shop`
    await su`drop table save_shop`
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    m = { save: (await import('@/app/(console)/console/products/actions')).saveProduct, db: await rows() }
  })
  afterAll(async () => {
    if (!su) return
    const t = state.tenantId
    if (t) for (const table of ['order_lines', 'order_events', 'orders', 'price_history', 'audit_events']) await su`delete from ${su(table)} where tenant_id = ${t}`
    if (t) await su`delete from tenants where id = ${t}`
    await su.end()
  })

  it('makes a blank SKU from the shop prefix and handle, unique in the shop; refuses another product\'s SKU in any case; lets two sizes swap', async () => {
    state.role = 'owner'
    const a = await m.db.product(state.tenantId, 'linen-kurta', [['M'], ['L']])
    const b = await m.db.product(state.tenantId, 'linen-kurta-2', [['M']])
    expect(await m.save(a, 1, input('linen-kurta', ['M', 'L'], [cell(['M']), cell(['L'])]))).toMatchObject({ ok: true, version: 2, handle: 'linen-kurta' })
    expect((await m.db.variantsOf(state.tenantId, a)).map((v) => [v.values, v.sku])).toEqual([[['M'], 'KS-LINKUR-M'], [['L'], 'KS-LINKUR-L']])
    expect(await m.save(b, 1, input('linen-kurta-2', ['M'], [cell(['M'])]))).toMatchObject({ ok: true })
    expect((await m.db.variantsOf(state.tenantId, b)).map((v) => v.sku)).toEqual(['KS-LINKUR-M-2'])

    // Another product's SKU, typed in lower case: refused, nothing changed.
    expect(await m.save(b, 2, input('linen-kurta-2', ['M'], [cell(['M'], { sku: 'ks-linkur-l' })]))).toEqual({ ok: false, error: 'SKU ks-linkur-l is already used by another product in your shop.', errors: { 'v:M:sku': 'Used by another product.' } })
    expect((await m.db.variantsOf(state.tenantId, b)).map((v) => v.sku)).toEqual(['KS-LINKUR-M-2'])
    // Its own SKUs swapped in one save; a typed SKU is kept as typed.
    expect(await m.save(a, 2, input('linen-kurta', ['M', 'L'], [cell(['M'], { sku: 'KS-LINKUR-L' }), cell(['L'], { sku: 'KS-LINKUR-M' })]))).toMatchObject({ ok: true, version: 3 })
    expect((await m.db.variantsOf(state.tenantId, a)).map((v) => v.sku)).toEqual(['KS-LINKUR-L', 'KS-LINKUR-M'])
    expect(await m.save(b, 2, input('linen-kurta-2', ['M'], [cell(['M'], { sku: 'Int.b/1' })]))).toMatchObject({ ok: true })
    expect((await m.db.variantsOf(state.tenantId, b)).map((v) => v.sku)).toEqual(['Int.b/1'])
    // A stale version is a conflict.
    expect(await m.save(b, 2, input('linen-kurta-2', ['M'], [cell(['M'])]))).toMatchObject({ ok: false, conflict: true })
  })

  it('a draft saves sizes still unpriced; a live product refuses one at its cell (PR·0)', async () => {
    state.role = 'owner'
    const a = await m.db.product(state.tenantId, 'pr0-kurta', [['S'], ['M']])
    expect(await m.save(a, 1, input('pr0-kurta', ['S', 'M'], [cell(['S'], { price: '899' }), cell(['M'], { price: '' })]))).toMatchObject({ ok: true })
    expect((await m.db.variantsOf(state.tenantId, a)).map((v) => v.price)).toEqual([89900, 0])
    await m.db.setStatus(state.tenantId, a, 'active')
    expect(await m.save(a, 2, input('pr0-kurta', ['S', 'M'], [cell(['S'], { price: '899' }), cell(['M'], { price: '' })]))).toMatchObject({ ok: false, errors: { 'v:M:price': 'A price, while it’s live.' } })
    await m.db.setStatus(state.tenantId, a, 'draft')
  })

  it('refuses a barcode another product has; keeps its own on a second save', async () => {
    state.role = 'owner'
    const a = await m.db.product(state.tenantId, 'cotton-dupatta', [[]])
    const b = await m.db.product(state.tenantId, 'silk-dupatta', [[]])
    expect(await m.save(a, 1, input('cotton-dupatta', [], [cell([], { gtin: EAN })]))).toMatchObject({ ok: true })
    expect(await m.save(a, 2, input('cotton-dupatta', [], [cell([], { gtin: EAN, price: '1499' })]))).toMatchObject({ ok: true })
    expect((await m.db.variantsOf(state.tenantId, a)).map((v) => [v.gtin, v.price])).toEqual([[EAN, 149900]])
    expect(await m.save(b, 1, input('silk-dupatta', [], [cell([], { gtin: EAN })]))).toEqual({ ok: false, error: `Barcode ${EAN} is already on another product in your shop.`, errors: { 'v::gtin': 'On another product.' } })
    expect((await m.db.variantsOf(state.tenantId, b)).map((v) => v.gtin)).toEqual([null])
  })

  it('archives an ordered size it drops, deletes a never-ordered one, and brings the archived row back when the size returns', async () => {
    state.role = 'owner'
    const p = await m.db.product(state.tenantId, 'block-print-kurta', [['M'], ['L'], ['XL']])
    expect(await m.save(p, 1, input('block-print-kurta', ['M', 'L', 'XL'], [cell(['M']), cell(['L']), cell(['XL'])]))).toMatchObject({ ok: true })
    const before = await m.db.variantsOf(state.tenantId, p)
    const L = before.find((v) => v.values[0] === 'L')!, XL = before.find((v) => v.values[0] === 'XL')!
    await m.db.orderLineFor(state.tenantId, L.id)

    expect(await m.save(p, 2, input('block-print-kurta', ['M'], [cell(['M'])]))).toMatchObject({ ok: true })
    const all = await m.db.variantsOf(state.tenantId, p, true)
    expect(all.map((v) => v.values[0])).toEqual(['M', 'L']) // XL deleted (never ordered)
    expect(all.find((v) => v.id === XL.id)).toBeUndefined()
    expect(all.find((v) => v.id === L.id)).toMatchObject({ sku: null, gtin: null, archived: true })

    expect(await m.save(p, 3, input('block-print-kurta', ['M', 'L'], [cell(['M']), cell(['L'], { price: '1599' })]))).toMatchObject({ ok: true })
    const back = await m.db.variantsOf(state.tenantId, p, true)
    expect(back.map((v) => [v.id === L.id, v.values[0], v.archived, v.sku, v.price, v.position])).toEqual([
      [false, 'M', false, 'KS-BLOPRI-M', 129900, 0], [true, 'L', false, 'KS-BLOPRI-L', 159900, 1],
    ])
  })

  it('writes the cost of goods only for a member who sees it; staff leave it as it was', async () => {
    state.role = 'owner'
    const p = await m.db.product(state.tenantId, 'chikan-kurti', [['S']])
    expect(await m.save(p, 1, input('chikan-kurti', ['S'], [cell(['S'], { cost: '450' })]))).toMatchObject({ ok: true })
    expect((await m.db.variantsOf(state.tenantId, p)).map((v) => v.unitCost)).toEqual([45000])
    state.role = 'staff'
    expect(await m.save(p, 2, input('chikan-kurti', ['S', 'M'], [cell(['S'], { cost: '999', price: '1399' }), cell(['M'], { cost: '999' })]))).toMatchObject({ ok: true })
    expect((await m.db.variantsOf(state.tenantId, p)).map((v) => [v.values[0], v.price, v.unitCost])).toEqual([['S', 139900, 45000], ['M', 129900, null]])
  })

  it('writes every field of a kept size: stock, M.R.P., what happens when it runs out', async () => {
    state.role = 'owner'
    const p = await m.db.product(state.tenantId, 'mul-saree', [['S'], ['M']])
    const shipsBy = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    expect(await m.save(p, 1, input('mul-saree', ['S', 'M'], [
      cell(['S'], { stock: '7', compareAt: '1599', whenOut: 'preorder', shipsBy, cap: '20' }),
      cell(['M'], { stock: '0', whenOut: 'made_to_order', leadMin: '3', leadMax: '7' }),
    ]))).toMatchObject({ ok: true })
    expect(await m.db.detailsOf(state.tenantId, p)).toEqual([
      { values: ['S'], stock: 7, compareAt: 159900, whenOut: 'preorder', shipsBy, leadMin: null, leadMax: null, cap: 20, gtin: null },
      { values: ['M'], stock: 0, compareAt: null, whenOut: 'made_to_order', shipsBy: null, leadMin: 3, leadMax: 7, cap: null, gtin: null },
    ])
    // Back to "stop selling": the pre-order and lead-time fields go with it.
    expect(await m.save(p, 2, input('mul-saree', ['S', 'M'], [cell(['S'], { stock: '2' }), cell(['M'], { stock: '4', compareAt: '1300' })]))).toMatchObject({ ok: true })
    expect(await m.db.detailsOf(state.tenantId, p)).toEqual([
      { values: ['S'], stock: 2, compareAt: null, whenOut: 'stop', shipsBy: null, leadMin: null, leadMax: null, cap: null, gtin: null },
      { values: ['M'], stock: 4, compareAt: 130000, whenOut: 'stop', shipsBy: null, leadMin: null, leadMax: null, cap: null, gtin: null },
    ])
  })

  it('lets two sizes swap their barcodes in one save', async () => {
    state.role = 'owner'
    const p = await m.db.product(state.tenantId, 'ikat-dupatta', [['S'], ['M']])
    expect(await m.save(p, 1, input('ikat-dupatta', ['S', 'M'], [cell(['S'], { gtin: EAN2 }), cell(['M'], { gtin: '8901234567883' })]))).toMatchObject({ ok: true })
    expect(await m.save(p, 2, input('ikat-dupatta', ['S', 'M'], [cell(['S'], { gtin: '8901234567883' }), cell(['M'], { gtin: EAN2 })]))).toMatchObject({ ok: true })
    expect((await m.db.detailsOf(state.tenantId, p)).map((v) => v.gtin)).toEqual(['8901234567883', EAN2])
  })

  it('refuses to drop a size with pre-orders still to pack, and changes nothing', async () => {
    state.role = 'owner'
    const p = await m.db.product(state.tenantId, 'bandhani-saree', [['S'], ['M']])
    expect(await m.save(p, 1, input('bandhani-saree', ['S', 'M'], [cell(['S']), cell(['M'], { stock: '0', price: '2100' })]))).toMatchObject({ ok: true })
    const M = (await m.db.variantsOf(state.tenantId, p)).find((v) => v.values[0] === 'M')!
    await m.db.orderLineFor(state.tenantId, M.id, 'preorder')
    expect(await m.save(p, 2, input('bandhani-saree', ['S'], [cell(['S'], { price: '999' })]))).toEqual({ ok: false, error: 'M has pre-orders still to pack. Pack or cancel them first.' })
    expect(await m.db.versionOf(state.tenantId, p)).toBe(2)
    expect((await m.db.variantsOf(state.tenantId, p)).map((v) => [v.values[0], v.price])).toEqual([['S', 129900], ['M', 210000]])
  })

  it('says so when a checkout holds the sizes past the writer\'s 1 s, and writes nothing', async () => {
    state.role = 'owner'
    const p = await m.db.product(state.tenantId, 'drop-tee', [['M']])
    expect(await m.save(p, 1, input('drop-tee', ['M'], [cell(['M'])]))).toMatchObject({ ok: true })
    const checkout = await su!.reserve()
    try {
      await checkout`begin`
      await checkout`select id from variants where tenant_id = ${state.tenantId} and product_id = ${p} order by id for update`
      const t0 = Date.now()
      expect(await m.save(p, 2, input('drop-tee', ['M'], [cell(['M'], { price: '1599' })]))).toEqual({ ok: false, error: 'Someone is buying this product right now. Save again in a moment.' })
      expect(Date.now() - t0).toBeLessThan(3000)
    } finally {
      await checkout`rollback`
      checkout.release()
    }
    expect(await m.db.versionOf(state.tenantId, p)).toBe(2)
    expect((await m.db.variantsOf(state.tenantId, p)).map((v) => v.price)).toEqual([129900])
    expect(await m.save(p, 2, input('drop-tee', ['M'], [cell(['M'], { price: '1599' })]))).toMatchObject({ ok: true, version: 3 })
  })
})

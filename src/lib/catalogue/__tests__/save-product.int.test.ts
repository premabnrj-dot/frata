// The editor's save (saveProduct, src/app/(console)/console/products/actions.ts) on a real Postgres, pinned before the
// import's chunk writer shares its rules (plan 2026-11-12-product-import PI·0 · 1): SKUs unique in the shop (any case,
// a default made and suffixed when blank, two sizes may swap theirs), a barcode on another product refused, a size
// removed and added back is the same row (archived while ordered), and the cost of goods written only by whoever sees
// it. The sign-in is faked (the member is the test's); the shop is a throwaway one made through ADMIN_URL and removed
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
const EAN = '4006381333931' // a real check digit

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
    /** One order for the size: from then on it is archived, never deleted. */
    orderLineFor: (t: string, variantId: string) => withTenant(t, async (tx) => {
      const [o] = await tx.insert(orders).values({ tenantId: t, number: 1 + Math.floor(Math.random() * 900_000), paymentMethod: 'cod', placedAt: new Date() }).returning({ id: orders.id })
      await tx.insert(orderLines).values({ tenantId: t, orderId: o!.id, variantId, title: 'L', qty: 1, unitPrice: 129900, taxableValue: 123714, kind: 'in_stock', stockTakenAt: new Date() })
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
    expect(await m.save(b, 2, input('linen-kurta-2', ['M'], [cell(['M'], { sku: 'ks-linkur-l' })]))).toEqual({ ok: false, error: 'SKU ks-linkur-l is already used by another product in your shop.' })
    expect((await m.db.variantsOf(state.tenantId, b)).map((v) => v.sku)).toEqual(['KS-LINKUR-M-2'])
    // Its own SKUs swapped in one save; a typed SKU is kept as typed.
    expect(await m.save(a, 2, input('linen-kurta', ['M', 'L'], [cell(['M'], { sku: 'KS-LINKUR-L' }), cell(['L'], { sku: 'KS-LINKUR-M' })]))).toMatchObject({ ok: true, version: 3 })
    expect((await m.db.variantsOf(state.tenantId, a)).map((v) => v.sku)).toEqual(['KS-LINKUR-L', 'KS-LINKUR-M'])
    expect(await m.save(b, 2, input('linen-kurta-2', ['M'], [cell(['M'], { sku: 'Int.b/1' })]))).toMatchObject({ ok: true })
    expect((await m.db.variantsOf(state.tenantId, b)).map((v) => v.sku)).toEqual(['Int.b/1'])
    // A stale version is a conflict.
    expect(await m.save(b, 2, input('linen-kurta-2', ['M'], [cell(['M'])]))).toMatchObject({ ok: false, conflict: true })
  })

  it('refuses a barcode another product has; keeps its own on a second save', async () => {
    state.role = 'owner'
    const a = await m.db.product(state.tenantId, 'cotton-dupatta', [[]])
    const b = await m.db.product(state.tenantId, 'silk-dupatta', [[]])
    expect(await m.save(a, 1, input('cotton-dupatta', [], [cell([], { gtin: EAN })]))).toMatchObject({ ok: true })
    expect(await m.save(a, 2, input('cotton-dupatta', [], [cell([], { gtin: EAN, price: '1499' })]))).toMatchObject({ ok: true })
    expect((await m.db.variantsOf(state.tenantId, a)).map((v) => [v.gtin, v.price])).toEqual([[EAN, 149900]])
    expect(await m.save(b, 1, input('silk-dupatta', [], [cell([], { gtin: EAN })]))).toEqual({ ok: false, error: `Barcode ${EAN} is already on another product in your shop.` })
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
})

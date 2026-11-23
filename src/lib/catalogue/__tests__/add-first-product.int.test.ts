// Home's first-product popup (addFirstProduct, plan docs/plans/2026-11-23-o2a-setup-card.md O2a·6) on a real Postgres: a
// complete product goes Active only through readiness() and setStatusIn; anything short of it is kept a draft and the
// reply names what it needs, in readiness's own words; prices are written in paise, every size at the price and the
// stock, no cost; photos come in with no colour; a size outside the shape's options, an Accountant and a photo from
// another store's folder are refused with nothing written. The sign-in is faked; the files' first bytes are taken as
// made (uploaded.ts reads Blob); the shops are throwaway ones, removed after. Skipped unless INT_DB_HOST is set.
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tenantId: '', role: 'owner' }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async (allowed: readonly string[]) => allowed.includes(state.role)
    ? { ok: true, userId: '99999999-9999-4999-8999-999999999999', email: 'int@example.com', staffRole: null, all: [],
      membership: { tenantId: state.tenantId, tenantName: 'Int first', role: state.role, supportSessionId: null } }
    : { ok: false, reason: 'no_access', message: 'You do not have access to this store' },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }))
vi.mock('@/lib/queries/storefront', () => ({ refreshShop: () => {}, shopCached: (_n: string, _s: string, f: unknown) => f, refreshHosts: () => {}, hostFor: (s: string) => `${s}.test` }))
vi.mock('@/lib/media/uploaded', () => ({ photosAreMade: async () => true }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const STORE = 'inttest.public.blob.vercel-storage.com'

describe.skipIf(!host)('addFirstProduct (O2a·6)', () => {
  const su = host ? postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} }) : null
  const made: string[] = []
  let A: typeof import('@/app/(console)/console/products/first-product-actions')
  const photo = (t: string) => ({ base: `https://${STORE}/tenants/${t}/products/${randomUUID()}`, widths: [400, 800], width: 900, height: 1125 })

  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.BLOB_STORE_ID = 'store_inttest'
    A = await import('@/app/(console)/console/products/first-product-actions')
  })
  afterAll(async () => {
    if (!su) return
    for (const t of made) {
      for (const table of ['price_history', 'audit_events']) await su`delete from ${su(table)} where tenant_id = ${t}`
      await su`delete from tenants where id = ${t}`
    }
    await su.end()
  })

  const store = async (sells: string[], more: { gstin?: string; hsn?: string } = {}) => {
    const [{ id }] = await su!<[{ id: string }]>`insert into tenants (slug, name) values (${'int-first-' + Date.now() + '-' + made.length}, 'Int first') returning id`
    await su!`insert into shop_settings (tenant_id, sells, default_hsn, gstin, gst_scheme, home_state, order_prefix) values (${id}, ${sells}, ${more.hsn ?? '6211'}, ${more.gstin ?? null}, 'regular', '29', 'KS')`
    made.push(id)
    state.tenantId = id
    state.role = 'owner'
    return id
  }
  const products = (t: string) => su!`select id, title, status, hsn from products where tenant_id = ${t}`
  const variantsOf = (t: string) => su!<{ values: string[]; price: string; stock: number; unit_cost: string | null }[]>`
    select option_values as values, price, stock, unit_cost from variants where tenant_id = ${t} order by position`
  const input = (t: string, more: Record<string, unknown> = {}) => ({ title: 'Ivory kurta set', price: '2,490', stock: '5', sizes: ['S', 'M', 'L', 'XL'], photos: [photo(t)], ...more })

  it('complete: Active, every size at ₹2,490 (249000 paise) with its stock and no cost, the photo with no colour', async () => {
    const t = await store(['women'])
    const r = await A.addFirstProduct(input(t), true)
    expect(r).toMatchObject({ ok: true, status: 'active', handle: 'ivory-kurta-set' })
    expect(await products(t)).toMatchObject([{ title: 'Ivory kurta set', status: 'active', hsn: '6211' }])
    expect((await variantsOf(t)).map((v) => [v.values, Number(v.price), v.stock, v.unit_cost])).toEqual([
      [['S'], 249000, 5, null], [['M'], 249000, 5, null], [['L'], 249000, 5, null], [['XL'], 249000, 5, null]])
    const imgs = await su!`select option_value as colour from product_images where tenant_id = ${t}`
    expect(imgs).toEqual([{ colour: null }])
  })

  it('no photo: kept a draft, and it says it needs at least one photo', async () => {
    const t = await store(['women'])
    expect(await A.addFirstProduct(input(t, { photos: [] }), true)).toMatchObject({ ok: true, status: 'draft', needs: ['at least one photo'] })
    expect(await products(t)).toMatchObject([{ status: 'draft' }])
  })

  it('"Add more details" saves a draft without asking to go live', async () => {
    const t = await store(['women'])
    expect(await A.addFirstProduct(input(t), false)).toMatchObject({ ok: true, status: 'draft' })
    expect(await products(t)).toMatchObject([{ status: 'draft' }])
  })

  it('a size outside the options is refused, nothing written', async () => {
    const t = await store(['women'])
    expect(await A.addFirstProduct(input(t, { sizes: ['S', 'XXXL'] }), true)).toMatchObject({ ok: false, errors: { sizes: 'Choose sizes from the list.' } })
    expect(await products(t)).toEqual([])
  })

  it('a store charging GST whose starting HSN has no rate: a draft that needs its HSN code', async () => {
    const t = await store(['women'], { gstin: '29AAGCB7383J1Z4', hsn: '9999' })
    expect(await A.addFirstProduct(input(t), true)).toMatchObject({ ok: true, status: 'draft', needs: ['its hsn code'] })
  })

  it('a beauty store: no sizes, a draft that needs its label', async () => {
    const t = await store(['beauty'])
    const r = await A.addFirstProduct(input(t, { title: 'Rose face mist', sizes: [] }), true)
    expect(r).toMatchObject({ ok: true, status: 'draft' })
    if (r.ok) expect(r.needs?.[0]).toMatch(/^its label/)
    expect((await variantsOf(t)).map((v) => v.values)).toEqual([[]])
  })

  it('Staff may add; an Accountant is refused', async () => {
    const t = await store(['women'])
    state.role = 'staff'
    expect(await A.addFirstProduct(input(t), true)).toMatchObject({ ok: true, status: 'active' })
    state.role = 'accountant'
    expect(await A.addFirstProduct(input(t, { title: 'Second kurta' }), true)).toMatchObject({ ok: false })
    expect(await products(t)).toHaveLength(1)
  })

  it('a photo from another store’s folder is refused, nothing written', async () => {
    const t = await store(['women'])
    expect(await A.addFirstProduct(input(t, { photos: [photo(randomUUID())] }), true)).toMatchObject({ ok: false, error: 'That photo isn’t in your store’s folder.' })
    expect(await products(t)).toEqual([])
  })

  it('checks what is typed, in words', async () => {
    const t = await store(['women'])
    expect(await A.addFirstProduct(input(t, { title: '  ' }), true)).toMatchObject({ ok: false, errors: { title: 'Give your product a name of up to 140 characters.' } })
    expect(await A.addFirstProduct(input(t, { price: '24.90' }), true)).toMatchObject({ ok: false, errors: { price: 'Whole rupees, digits only.' } })
    expect(await A.addFirstProduct(input(t, { stock: '-1' }), true)).toMatchObject({ ok: false, errors: { stock: 'A number, 0 or more.' } })
    expect(await products(t)).toEqual([])
  })

  it('the popup’s read: what the store sells, its types with their chart sizes', async () => {
    const t = await store(['women', 'kids'])
    await A.addFirstProduct(input(t, { photos: [] }), false)
    const r = await A.loadFirstProduct()
    expect(r).toMatchObject({ ok: true, sells: ['women', 'kids'] })
    if (r.ok) expect(r.types.find((x) => x.name === 'Kids')?.chartSizes).toEqual(['2–3 Y', '3–4 Y', '4–5 Y', '5–6 Y', '6–7 Y', '7–8 Y'])
  })
})

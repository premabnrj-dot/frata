// The products list's actions on many (src/app/(console)/console/products/bulk-actions.ts, plan
// docs/plans/2026-11-13-products-pr1.md) on a real Postgres:
// - Delete takes only drafts never live, scheduled or ordered, and names the rest.
// - Archive's Undo brings a scheduled drop back scheduled.
// - Set status leaves what isn't ready and names it.
// - Duplicate copies details, sizes, prices and colours, but not photos, stock, SKUs or status.
// - Add to collection takes a manual collection of this shop only.
// - Another shop's ids are not found by any action.
// The sign-in is faked; the shops are throwaway ones made through ADMIN_URL. Skipped unless INT_DB_HOST is set.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'

const state = vi.hoisted(() => ({ tenantId: '' }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async () => ({ ok: true, userId: '99999999-9999-4999-8999-999999999999', email: 'int@example.com', staffRole: null, all: [],
    membership: { tenantId: state.tenantId, tenantName: 'Int bulk', role: 'owner', supportSessionId: null } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }))
vi.mock('@/lib/queries/storefront', async (orig) => ({ ...(await orig<object>()), refreshShop: vi.fn() }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('the products list acting on many', () => {
  const su = host ? postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} }) : null
  let a: typeof import('@/app/(console)/console/products/bulk-actions')
  let other = ''
  const shop = async (slug: string) => {
    const [{ id }] = await su!<[{ id: string }]>`insert into tenants (slug, name) values (${slug + Date.now()}, 'Int bulk') returning id`
    await su!`create temp table s as select * from shop_settings where tenant_id = ${PROOF_A}`
    await su!`update s set tenant_id = ${id}, order_prefix = 'KB'`
    await su!`insert into shop_settings select * from s`
    await su!`drop table s`
    return id
  }
  const product = async (t: string, handle: string, o: { status?: string; publishedAt?: Date | null; publishAt?: Date | null; price?: number; sizes?: string[] } = {}) => {
    const sizes = o.sizes ?? ['S', 'M']
    const [p] = await su!<[{ id: string }]>`insert into products (tenant_id, handle, title, status, published_at, publish_at, options, option_values, tags, hsn)
      values (${t}, ${handle}, ${'Int ' + handle}, ${o.status ?? 'draft'}, ${o.publishedAt ?? null}, ${o.publishAt ?? null}, ${sizes.length ? ['Size'] : []}, ${JSON.stringify(sizes.length ? [sizes] : [])}::jsonb, ${['festive']}, '6204') returning id`
    for (const [i, s] of (sizes.length ? sizes.map((x) => [x]) : [[]]).entries()) await su!`insert into variants (tenant_id, product_id, option_values, price, stock, sku, position) values (${t}, ${p.id}, ${s}, ${o.price ?? 0}, 4, ${handle.toUpperCase() + '-' + (s[0] ?? 'ONE')}, ${i})`
    return p.id
  }
  const statusOf = async (id: string) => (await su!<[{ status: string; publish_at: Date | null }]>`select status, publish_at from products where id = ${id}`)[0]

  beforeAll(async () => {
    if (!su) return
    state.tenantId = await shop('int-bulk-')
    other = await shop('int-bulk-other-')
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    a = await import('@/app/(console)/console/products/bulk-actions')
  })
  afterAll(async () => {
    if (!su) return
    for (const t of [state.tenantId, other].filter(Boolean)) {
      for (const table of ['order_lines', 'orders', 'price_history', 'audit_events']) await su`delete from ${su(table)} where tenant_id = ${t}`
      await su`delete from tenants where id = ${t}`
    }
    await su.end()
  })

  it('deletes only drafts never live or ordered, and names the rest with why', async () => {
    const t = state.tenantId
    const draft = await product(t, 'del-draft'), live = await product(t, 'del-live', { status: 'active', publishedAt: new Date(), price: 99900 })
    const was = await product(t, 'del-was-live', { publishedAt: new Date() }), sold = await product(t, 'del-sold')
    const [v] = await su!<[{ id: string }]>`select id from variants where product_id = ${sold} limit 1`
    const [o] = await su!<[{ id: string }]>`insert into orders (tenant_id, number, payment_method, placed_at) values (${t}, ${Math.floor(Math.random() * 900000) + 1}, 'cod', now()) returning id`
    await su!`insert into order_lines (tenant_id, order_id, variant_id, title, qty, unit_price, taxable_value, kind) values (${t}, ${o.id}, ${v.id}, 'x', 1, 100, 95, 'in_stock')`
    const r = await a.bulkDelete([draft, live, was, sold])
    expect(r).toMatchObject({ ok: true, deleted: 1 })
    if (!r.ok) return
    expect(Object.fromEntries(r.kept.map((k) => [k.title, k.why]))).toEqual({ 'Int del-live': 'live', 'Int del-was-live': 'live', 'Int del-sold': 'ordered' })
    expect(await statusOf(draft)).toBeUndefined()
    expect((await statusOf(sold)).status).toBe('draft')
  })

  it('archives, and Undo brings each back as it was: a drop still to come stays scheduled', async () => {
    const t = state.tenantId
    const at = new Date(Date.now() + 3 * 86400_000)
    const drop = await product(t, 'arch-drop', { status: 'active', publishAt: at, publishedAt: at, price: 99900, sizes: [] }), plain = await product(t, 'arch-draft')
    const r = await a.bulkStatus([drop, plain], 'archived')
    expect(r).toMatchObject({ ok: true, changed: 2 })
    expect((await statusOf(drop)).status).toBe('archived')
    if (!r.ok) return
    // Undo goes through the same rule as Publish, which asks for a photo: give it one.
    await su!`insert into product_images (tenant_id, product_id, base, widths, width, height) values (${t}, ${drop}, ${'https://x.blob/t/' + drop}, ${[400]}, 400, 500)`
    expect(await a.restoreStatus(r.before)).toMatchObject({ ok: true, restored: 2, refused: [] })
    const back = await statusOf(drop)
    expect(back.status).toBe('active'); expect(back.publish_at?.toISOString()).toBe(at.toISOString())
    expect((await statusOf(plain)).status).toBe('draft')
  })

  it('keeps a scheduled draft and an archived one; Delete says which is archived already', async () => {
    const t = state.tenantId
    const soon = await product(t, 'del-scheduled', { publishAt: new Date(Date.now() + 86400_000) })
    const old = await product(t, 'del-archived', { status: 'archived', publishedAt: new Date() })
    const r = await a.bulkDelete([soon, old])
    expect(r).toMatchObject({ ok: true, deleted: 0 })
    if (r.ok) expect(Object.fromEntries(r.kept.map((k) => [k.title, k.why]))).toEqual({ 'Int del-scheduled': 'live', 'Int del-archived': 'archived' })
    // Archiving what is archived already changes nothing (its archived date stays).
    expect(await a.bulkStatus([old], 'archived')).toMatchObject({ ok: true, changed: 0, refused: [] })
  })

  it('an Undo that can’t put one back names it, and leaves it as it is', async () => {
    const t = state.tenantId
    const bare = await product(t, 'undo-bare', { status: 'active', publishedAt: new Date(), price: 99900 })
    const r = await a.bulkStatus([bare], 'archived')
    expect(r).toMatchObject({ ok: true, changed: 1 })
    if (!r.ok) return
    expect(await a.restoreStatus(r.before)).toMatchObject({ ok: true, restored: 0, refused: [{ title: 'Int undo-bare' }] })
    expect((await statusOf(bare)).status).toBe('archived')
  })

  it('leaves a product that isn’t ready as it was, and names what it needs', async () => {
    const p = await product(state.tenantId, 'not-ready')
    const r = await a.bulkStatus([p], 'active')
    expect(r).toMatchObject({ ok: true, changed: 0, refused: [{ title: 'Int not-ready' }] })
    expect((await statusOf(p)).status).toBe('draft')
  })

  it('duplicates as a draft copy: details, sizes, prices and colours; no photos, stock, SKUs or status', async () => {
    const t = state.tenantId
    const src = await product(t, 'dup-src', { status: 'active', publishedAt: new Date(), price: 249000 })
    await su!`insert into product_colours (tenant_id, product_id, value, hex) values (${t}, ${src}, 'Rust', '#b5452e')`
    const r = await a.duplicateProduct(src)
    expect(r).toMatchObject({ ok: true, handle: 'int-dup-src-copy' })
    if (!r.ok) return
    const [p] = await su!<[{ status: string; title: string; tags: string[]; published_at: Date | null }]>`select status, title, tags, published_at from products where id = ${r.id}`
    expect(p).toMatchObject({ status: 'draft', title: 'Int dup-src copy', tags: ['festive'], published_at: null })
    const vs = await su!<{ price: string; stock: number; sku: string | null }[]>`select price, stock, sku from variants where product_id = ${r.id} order by position`
    expect(vs.map((v) => [Number(v.price), v.stock, v.sku])).toEqual([[249000, 0, null], [249000, 0, null]])
    expect((await su!`select hex from product_colours where product_id = ${r.id}`).map((c) => c.hex)).toEqual(['#b5452e'])
    expect((await su!`select 1 from product_images where product_id = ${r.id}`).length).toBe(0)
  })

  it('adds to a manual collection of this shop only', async () => {
    const t = state.tenantId
    const p = await product(t, 'col-p')
    const [man] = await su!<[{ id: string }]>`insert into collections (tenant_id, handle, title, kind) values (${t}, 'int-man', 'Festive', 'manual') returning id`
    const [auto] = await su!<[{ id: string }]>`insert into collections (tenant_id, handle, title, kind) values (${t}, 'int-auto', 'Auto', 'auto') returning id`
    const [theirs] = await su!<[{ id: string }]>`insert into collections (tenant_id, handle, title, kind) values (${other}, 'int-theirs', 'Theirs', 'manual') returning id`
    expect(await a.addToCollection([p], man.id)).toEqual({ ok: true, added: 1, name: 'Festive' })
    expect(await a.addToCollection([p], man.id)).toEqual({ ok: true, added: 0, name: 'Festive' })
    expect(await a.addToCollection([p], auto.id)).toEqual({ ok: false, error: 'That collection is not in your shop.' })
    expect(await a.addToCollection([p], theirs.id)).toEqual({ ok: false, error: 'That collection is not in your shop.' })
  })

  it('does not find another shop’s products, whatever the action', async () => {
    const theirs = await product(other, 'theirs', { status: 'active', publishedAt: new Date(), price: 100 })
    expect(await a.bulkDelete([theirs])).toEqual({ ok: true, deleted: 0, kept: [] })
    expect(await a.bulkStatus([theirs], 'archived')).toMatchObject({ ok: true, changed: 0 })
    expect(await a.restoreStatus([{ id: theirs, status: 'draft', publishAt: null }])).toEqual({ ok: true, restored: 0, refused: [] })
    expect(await a.duplicateProduct(theirs)).toEqual({ ok: false, error: 'That product is not in your shop.' })
    const [mine] = await su!<[{ id: string }]>`insert into collections (tenant_id, handle, title, kind) values (${state.tenantId}, 'int-mine', 'Mine', 'manual') returning id`
    expect(await a.addToCollection([theirs], mine.id)).toEqual({ ok: true, added: 0, name: 'Mine' })
    expect((await statusOf(theirs)).status).toBe('active')
  })
})

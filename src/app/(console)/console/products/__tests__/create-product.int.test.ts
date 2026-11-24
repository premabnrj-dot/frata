// A new product's shape (createProduct, products/actions.ts) on a real Postgres, pinned before O2a's first-product popup
// lifts the rule into firstProductShape (plan docs/plans/2026-11-23-o2a-setup-card.md, O2a·0): the name picks the kind
// and the type, the type's start sizes come with it, a one-size name gets one variant, and a store that sells nothing
// sized gets no sizes whatever the name says. The sign-in is faked; each case makes its own store and removes it.
// Skipped unless INT_DB_HOST is set.
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tenantId: '' }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async () => ({ ok: true, userId: '99999999-9999-4999-8999-999999999999', email: 'int@example.com', staffRole: null, all: [],
    membership: { tenantId: state.tenantId, tenantName: 'Int create', role: 'owner', supportSessionId: null } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }))
vi.mock('@/lib/queries/storefront', () => ({ refreshShop: () => {}, shopCached: (_n: string, _s: string, f: unknown) => f, refreshHosts: () => {}, hostFor: (s: string) => `${s}.test` }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('createProduct: a new product’s kind, type and sizes', () => {
  const su = host ? postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} }) : null
  const made: string[] = []
  let create: typeof import('@/app/(console)/console/products/actions').createProduct

  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    create = (await import('@/app/(console)/console/products/actions')).createProduct
  })
  afterAll(async () => {
    if (!su) return
    for (const t of made) {
      for (const table of ['price_history', 'audit_events']) await su`delete from ${su(table)} where tenant_id = ${t}`
      await su`delete from tenants where id = ${t}`
    }
    await su.end()
  })

  /** A store that sells `sells`, signed in as its owner. */
  const store = async (sells: string[]) => {
    const [{ id }] = await su!<[{ id: string }]>`insert into tenants (slug, name) values (${'int-create-' + Date.now() + '-' + made.length}, 'Int create') returning id`
    await su!`insert into shop_settings (tenant_id, sells, default_hsn) values (${id}, ${sells}, '6211')`
    made.push(id)
    state.tenantId = id
    return id
  }
  /** The product as written: its type's name, options, and each variant's sizes in order. */
  const shapeOf = async (t: string, productId: string) => {
    const [p] = await su!<[{ type: string | null; options: string[]; values: string[][]; hsn: string | null }]>`
      select pt.name as type, p.options, p.option_values as values, p.hsn from products p left join product_types pt on pt.id = p.type_id
      where p.tenant_id = ${t} and p.id = ${productId}`
    const v = await su!<{ values: string[]; price: string }[]>`select option_values as values, price from variants where tenant_id = ${t} and product_id = ${productId} order by position`
    return { type: p!.type, options: p!.options, sizes: v.map((x) => x.values), prices: v.map((x) => Number(x.price)), hsn: p!.hsn }
  }

  it('"Kids kurta" in a store selling women and kids: the Kids type and its first three sizes', async () => {
    const t = await store(['women', 'kids'])
    const r = await create({ title: '  Kids   kurta ' })
    expect(r).toMatchObject({ ok: true, handle: 'kids-kurta' })
    if (!r.ok) return
    expect(await shapeOf(t, r.id)).toEqual({ type: 'Kids', options: ['Size'], sizes: [['2–3 Y'], ['3–4 Y'], ['4–5 Y']], prices: [0, 0, 0], hsn: '6211' })
  })

  it('"Silk saree": one variant, no sizes, the One size type (no chart)', async () => {
    const t = await store(['women'])
    const r = await create({ title: 'Silk saree' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(await shapeOf(t, r.id)).toEqual({ type: 'One size', options: [], sizes: [[]], prices: [0], hsn: '6211' })
    const [c] = await su!<[{ rows: number }]>`select jsonb_array_length(size_chart->'rows') as rows from product_types where tenant_id = ${t} and name = 'One size'`
    expect(c!.rows).toBe(0)
  })

  it('a beauty-only store: no sizes whatever the name says', async () => {
    const t = await store(['beauty'])
    const r = await create({ title: 'Ivory kurta set' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(await shapeOf(t, r.id)).toMatchObject({ type: null, options: [], sizes: [[]] })
  })

  it('"Ivory kurta set" in a women’s store: the Kurta set type and startSizes.sized', async () => {
    const { startSizes } = await import('@/domains/catalogue/kind')
    const t = await store(['women'])
    const r = await create({ title: 'Ivory kurta set' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(startSizes.sized).toEqual(['S', 'M', 'L'])
    expect(await shapeOf(t, r.id)).toEqual({ type: 'Kurta set · Women', options: ['Size'], sizes: [['S'], ['M'], ['L']], prices: [0, 0, 0], hsn: '6211' })
  })

  it('presses the same sizes as the first-product popup: the start sizes the type’s own chart has (shape.pressed)', async () => {
    const t = await store(['women'])
    expect((await create({ title: 'First kurta set' })).ok).toBe(true) // makes the store's types
    // The store's kurta-set chart without L: the popup presses S and M, so New product must too (it pressed S, M, L).
    await su!`update product_types set size_chart = jsonb_set(size_chart, '{rows}', (select coalesce(jsonb_agg(r), '[]') from jsonb_array_elements(size_chart->'rows') r where r->>'size' <> 'L'))
      where tenant_id = ${t} and name = 'Kurta set · Women'`
    const r = await create({ title: 'Ivory kurta set' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(await shapeOf(t, r.id)).toMatchObject({ type: 'Kurta set · Women', options: ['Size'], sizes: [['S'], ['M']] })
  })
})

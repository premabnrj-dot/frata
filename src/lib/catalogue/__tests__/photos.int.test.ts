// Photos by file name (plan 2026-11-12-product-import PI·2 · 8) on a real Postgres: addPhotos attaches a product's
// batch after its photos in the order given, keeps a colour only when it is the product's own, refuses another shop's
// product and a photo in another shop's folder with nothing written, holds a product to 10 photos, and audits a
// support visit with the write; the same batch sent again adds nothing twice; only a live product's photos purge the
// shop's catalogue. The editor's attachPhotos (the same attachIn): after the photos it has, no colour, past 10, 13 at
// once refused, the catalogue purged. photoTargets: what a page matches against. A product called Photos gets
// photos-2. The import's upload bucket: a photo counts once, at its 400, which alone writes its start; a larger size
// only within the start's window or the next, three of them; the shop's hour runs out at 500 photos, its day at 2,000.
// The sign-in is faked; the files' first bytes are taken as made (uploaded.ts reads Blob); the shops are throwaway
// ones made through ADMIN_URL and removed after. Skipped unless INT_DB_HOST is set.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { revalidateTag } from 'next/cache'
import { dropShops, makeShop } from './import-helpers'

const state = vi.hoisted(() => ({ tenantId: '', support: null as string | null }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async () => ({ ok: true, userId: '99999999-9999-4999-8999-999999999999', email: state.support ? 'staff@frata.test' : 'int@example.com', staffRole: null, all: [],
    membership: { tenantId: state.tenantId, tenantName: 'Int photos', role: 'staff', supportSessionId: state.support } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }))
vi.mock('@/lib/media/uploaded', () => ({ photosAreMade: async () => true }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const STORE = 'inttest.public.blob.vercel-storage.com'

describe.skipIf(!host)('photos by file name', () => {
  const su = host ? postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} }) : null
  let a: typeof import('@/app/(console)/console/products/photos/actions')
  let bucket: typeof import('@/lib/media/import-bucket')
  let editor: typeof import('@/app/(console)/console/products/actions')
  let targets: typeof import('@/lib/queries/photos')
  const shops: string[] = []
  const photo = (t: string, colour: string | null = null) => ({ base: `https://${STORE}/tenants/${t}/products/${randomUUID()}`, widths: [400, 800], width: 900, height: 1125, colour })
  async function product(t: string, handle: string, colours: string[] = []) {
    const [p] = await su!<[{ id: string }]>`insert into products (tenant_id, handle, title, options, option_values)
      values (${t}, ${handle}, ${handle}, ${colours.length ? ['Size', 'Colour'] : ['Size']}, ${su!.json(colours.length ? [['M'], colours] : [['M']])}) returning id`
    return p!.id
  }
  const rows = (id: string) => su!`select base, option_value, position from product_images where product_id = ${id} order by position`

  beforeAll(async () => {
    if (!su) return
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.BLOB_STORE_ID = 'store_inttest'
    a = await import('@/app/(console)/console/products/photos/actions')
    bucket = await import('@/lib/media/import-bucket')
    editor = await import('@/app/(console)/console/products/actions')
    targets = await import('@/lib/queries/photos')
  })
  afterAll(async () => {
    if (!su) return
    await dropShops(su, shops)
    await su.end()
  })

  it('attaches after the product\'s photos, in the order given; a colour only when it is the product\'s', async () => {
    const t = state.tenantId = await makeShop(su!, shops, 'ph-order')
    const id = await product(t, 'linen-kurta', ['Red', 'Indigo'])
    await su!`insert into product_images (tenant_id, product_id, base, widths, width, height, position) values (${t}, ${id}, ${photo(t).base}, '{400}', 900, 1125, 0)`
    const batch = [photo(t, 'red'), photo(t, 'Saffron'), photo(t)]
    expect(await a.addPhotos({ productId: id, photos: batch })).toEqual({ ok: true, added: 3 })
    const got = await rows(id)
    expect(got.slice(1).map((r) => [r.base, r.option_value, r.position])).toEqual([[batch[0]!.base, 'Red', 1], [batch[1]!.base, null, 2], [batch[2]!.base, null, 3]])
    expect((await su!`select action, actor_kind from audit_events where tenant_id = ${t}`).map((x) => [x.action, x.actor_kind])).toEqual([['product.photos', 'member']])
  })

  it('another shop\'s product, or a photo in another shop\'s folder, is refused with nothing written', async () => {
    const other = await makeShop(su!, shops, 'ph-other')
    const theirs = await product(other, 'their-kurta')
    const t = state.tenantId = await makeShop(su!, shops, 'ph-mine')
    const mine = await product(t, 'my-kurta')
    expect(await a.addPhotos({ productId: theirs, photos: [photo(t)] })).toEqual({ ok: false, error: 'This product is not in your shop.' })
    expect(await a.addPhotos({ productId: mine, photos: [photo(other)] })).toEqual({ ok: false, error: 'That photo is not in your shop’s folder.' })
    expect(await a.addPhotos({ productId: mine, photos: [{ ...photo(t), base: photo(t).base.replace('/products/', '/theme/') }] })).toEqual({ ok: false, error: 'That photo is not in your shop’s folder.' })
    expect(await a.addPhotos({ productId: mine, photos: [{ ...photo(t), widths: [400, 640] }] })).toEqual({ ok: false, error: 'That photo’s sizes are not ones we make.' })
    expect(await a.addPhotos({ productId: mine, photos: [{ ...photo(t), tenantId: other }] })).toEqual({ ok: false, error: 'Those photos could not be read. Upload them again.' })
    expect(await a.addPhotos({ productId: mine, photos: Array.from({ length: 11 }, () => photo(t)) })).toEqual({ ok: false, error: 'Up to 10 photos a product.' })
    expect((await su!`select count(*)::int n from product_images where tenant_id = any(${[t, other]})`)[0]!.n).toBe(0)
  })

  it(`holds a product to 10 photos, counting the ones it has`, async () => {
    const t = state.tenantId = await makeShop(su!, shops, 'ph-cap')
    const id = await product(t, 'full-kurta')
    expect(await a.addPhotos({ productId: id, photos: Array.from({ length: 9 }, () => photo(t)) })).toEqual({ ok: true, added: 9 })
    expect(await a.addPhotos({ productId: id, photos: [photo(t), photo(t)] })).toEqual({ ok: false, error: 'This product has room for 1 more photo.' })
    expect(await a.addPhotos({ productId: id, photos: [photo(t)] })).toEqual({ ok: true, added: 1 })
    expect(await a.addPhotos({ productId: id, photos: [photo(t)] })).toEqual({ ok: false, error: 'This product has its 10 photos.' })
    expect((await rows(id)).length).toBe(10)
  })

  it('a support visit is audited with the write', async () => {
    const t = state.tenantId = await makeShop(su!, shops, 'ph-support')
    const id = await product(t, 'visit-kurta')
    const [visit] = await su!`insert into support_sessions (tenant_id, staff_user_id, staff_email, reason, expires_at) values (${t}, ${t}, 'staff@frata.test', 'setup_help', now() + interval '1 hour') returning id`
    state.support = visit!.id
    try {
      expect(await a.addPhotos({ productId: id, photos: [photo(t)] })).toEqual({ ok: true, added: 1 })
      expect((await su!`select action, actor_kind, target, support_session_id from audit_events where tenant_id = ${t}`).map((x) => [x.action, x.actor_kind, x.target, x.support_session_id]))
        .toEqual([['product.photos', 'support', id, visit!.id]])
    } finally {
      state.support = null
    }
  })

  it('the same batch again adds nothing twice (an attach whose answer was lost, sent again by Try again)', async () => {
    const t = state.tenantId = await makeShop(su!, shops, 'ph-again')
    const id = await product(t, 'again-kurta')
    const first = [photo(t), photo(t)]
    expect(await a.addPhotos({ productId: id, photos: first })).toEqual({ ok: true, added: 2 })
    expect(await a.addPhotos({ productId: id, photos: [...first, photo(t)] })).toEqual({ ok: true, added: 1 })
    expect(await a.addPhotos({ productId: id, photos: first })).toEqual({ ok: true, added: 0 })
    expect((await rows(id)).map((r) => r.position)).toEqual([0, 1, 2])
  })

  it('only a live product\'s new photos purge the shop\'s catalogue', async () => {
    const t = state.tenantId = await makeShop(su!, shops, 'ph-live')
    const draft = await product(t, 'draft-kurta'), live = await product(t, 'live-kurta')
    await su!`update products set status = 'active', published_at = now() where id = ${live}`
    vi.mocked(revalidateTag).mockClear()
    expect(await a.addPhotos({ productId: draft, photos: [photo(t)] })).toMatchObject({ ok: true })
    expect(vi.mocked(revalidateTag).mock.calls.flat()).not.toContain(`shop:${t}:catalogue`)
    expect(await a.addPhotos({ productId: live, photos: [photo(t)] })).toMatchObject({ ok: true })
    expect(vi.mocked(revalidateTag).mock.calls.flat()).toContain(`shop:${t}:catalogue`)
  })

  it('the editor\'s attachPhotos: after its photos, no colour, past 10, 13 at once refused, the catalogue purged', async () => {
    const t = state.tenantId = await makeShop(su!, shops, 'ph-editor')
    const id = await product(t, 'editor-kurta', ['Red'])
    expect(await a.addPhotos({ productId: id, photos: Array.from({ length: 10 }, () => photo(t)) })).toEqual({ ok: true, added: 10 })
    vi.mocked(revalidateTag).mockClear()
    const more = [photo(t, 'Red'), photo(t)]
    expect(await editor.attachPhotos(id, more)).toEqual({ ok: true })
    const got = await rows(id)
    expect(got.slice(10).map((r) => [r.base, r.option_value, r.position])).toEqual([[more[0]!.base, null, 10], [more[1]!.base, null, 11]])
    expect(vi.mocked(revalidateTag).mock.calls.flat()).toContain(`shop:${t}:catalogue`)
    expect(await editor.attachPhotos(id, Array.from({ length: 13 }, () => photo(t)))).toEqual({ ok: false, error: 'Up to 12 photos at a time.' })
    expect(await editor.attachPhotos(id, [{ ...photo(t), base: photo(randomUUID()).base }])).toEqual({ ok: false, error: 'That photo is not in your shop’s folder.' })
    expect((await rows(id)).length).toBe(12)
  })

  it('photoTargets: each product not archived, its sizes\' SKUs with their colour, its colours, its photos', async () => {
    const t = state.tenantId = await makeShop(su!, shops, 'ph-targets')
    const id = await product(t, 'sari', ['Rani', 'Haldi'])
    const gone = await product(t, 'old-sari')
    await su!`update products set status = 'archived' where id = ${gone}`
    await su!`insert into variants (tenant_id, product_id, option_values, sku, price, position) values
      (${t}, ${id}, '{M,Rani}', 'KS-SAR-M-RAN', 99900, 0), (${t}, ${id}, '{M,Haldi}', 'KS-SAR-M-HAL', 99900, 1), (${t}, ${id}, '{L,Haldi}', null, 99900, 2)`
    await su!`insert into variants (tenant_id, product_id, option_values, sku, price, position, archived_at) values (${t}, ${id}, '{S,Rani}', 'KS-SAR-S-RAN', 99900, 3, now())`
    await su!`insert into product_images (tenant_id, product_id, base, widths, width, height, position) values (${t}, ${id}, ${photo(t).base}, '{400}', 900, 1125, 0)`
    expect(await targets.photoTargets(t)).toEqual([{ id, title: 'sari', handle: 'sari', photos: 1, colours: ['Rani', 'Haldi'],
      skus: [{ sku: 'KS-SAR-M-RAN', colour: 'Rani' }, { sku: 'KS-SAR-M-HAL', colour: 'Haldi' }] }])
  })

  it('a product called Photos gets photos-2: Frrata\'s pages keep their addresses', async () => {
    state.tenantId = await makeShop(su!, shops, 'ph-reserved')
    expect(await editor.createProduct({ title: 'Photos' })).toMatchObject({ ok: true, handle: 'photos-2' })
    expect(await editor.createProduct({ title: 'Import' })).toMatchObject({ ok: true, handle: 'import-2' })
  })

  it('the upload bucket: one count a photo, its larger sizes only after its 400, three more a photo', async () => {
    const t = randomUUID(), now = new Date()
    const ph = randomUUID()
    expect(await bucket.importToken(t, ph, 800, now)).toBe(false) // not started
    expect(await bucket.importToken(t, ph, 400, now)).toBe(true)
    expect(await bucket.importToken(t, ph, 400, now)).toBe(false) // started once only
    expect(await bucket.importToken(t, ph, 800, now)).toBe(true)
    expect(await bucket.importToken(t, ph, 1200, now)).toBe(true)
    expect(await bucket.importToken(t, ph, 1600, now)).toBe(true)
    expect(await bucket.importToken(t, ph, 1600, now)).toBe(false) // a fifth token
    // Larger sizes never start a photo: their counter is not the start.
    const sizesOnly = randomUUID()
    for (let i = 0; i < 3; i++) expect(await bucket.importToken(t, sizesOnly, 800, now)).toBe(false)
    expect(await bucket.importToken(t, sizesOnly, 400, now)).toBe(true)
    // Started just before the hour turns: its sizes still come after it; two turns later, none.
    const late = randomUUID(), turn = Math.ceil(now.getTime() / 3_600_000) * 3_600_000
    expect(await bucket.importToken(t, late, 400, new Date(turn - 1000))).toBe(true)
    expect(await bucket.importToken(t, late, 800, new Date(turn + 1000))).toBe(true)
    expect(await bucket.importToken(t, late, 1200, new Date(turn + 3_600_000 + 1000))).toBe(false)
    // The shop's hour: 500 photos; its day: 2,000.
    const window = (ms: number, w: number) => new Date(Math.floor(ms / w) * w)
    const fill = async (action: string, shop: string, at: Date, n: number) => {
      const key = (await import('node:crypto')).createHash('sha256').update(`${action}:${shop}`).digest('hex')
      await su!`insert into rate_limits (key, window_start, n) values (${key}, ${at}, ${n})`
    }
    const shop = randomUUID()
    await fill('upload_import:shop', shop, window(now.getTime(), 3_600_000), 499)
    expect(await bucket.importToken(shop, randomUUID(), 400, now)).toBe(true)
    expect(await bucket.importToken(shop, randomUUID(), 400, now)).toBe(false)
    const busy = randomUUID()
    await fill('upload_import:shop_day', busy, window(now.getTime(), 86_400_000), 2000)
    expect(await bucket.importToken(busy, randomUUID(), 400, now)).toBe(false)
  })
})

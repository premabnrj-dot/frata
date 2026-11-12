// Photos by file name (plan 2026-11-12-product-import PI·2 · 8) on a real Postgres: addPhotos attaches a product's
// batch after its photos in the order given, keeps a colour only when it is the product's own, refuses another shop's
// product and a photo in another shop's folder with nothing written, holds a product to 10 photos, and audits a
// support visit with the write. The import's upload bucket: a photo counts once, at its 400; a larger size only for a
// photo that started, four tokens a photo; the shop's hour runs out at 500 photos.
// The sign-in is faked; the files' first bytes are taken as made (uploaded.ts reads Blob); the shops are throwaway
// ones made through ADMIN_URL and removed after. Skipped unless INT_DB_HOST is set.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
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

  it('the upload bucket: one count a photo, its larger sizes only after its 400, four tokens a photo', async () => {
    const t = randomUUID(), now = new Date()
    const ph = randomUUID()
    expect(await bucket.importToken(t, ph, 800, now)).toBe(false) // not started
    expect(await bucket.importToken(t, ph, 400, now)).toBe(true)
    expect(await bucket.importToken(t, ph, 400, now)).toBe(false) // started once only
    expect(await bucket.importToken(t, ph, 800, now)).toBe(true)
    expect(await bucket.importToken(t, ph, 1200, now)).toBe(true)
    expect(await bucket.importToken(t, ph, 1600, now)).toBe(true)
    expect(await bucket.importToken(t, ph, 1600, now)).toBe(false) // a fifth token
    // A photo started just before the hour turns keeps its sizes after it.
    const late = randomUUID(), turn = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000)
    expect(await bucket.importToken(t, late, 400, new Date(turn.getTime() - 1000))).toBe(true)
    expect(await bucket.importToken(t, late, 800, new Date(turn.getTime() + 1000))).toBe(true)
    // The shop's hour: 500 photos.
    const shop = randomUUID()
    const key = (await import('node:crypto')).createHash('sha256').update(`upload_import:shop:${shop}`).digest('hex')
    await su!`insert into rate_limits (key, window_start, n) values (${key}, ${new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000)}, 499)`
    expect(await bucket.importToken(shop, randomUUID(), 400, now)).toBe(true)
    expect(await bucket.importToken(shop, randomUUID(), 400, now)).toBe(false)
  })
})

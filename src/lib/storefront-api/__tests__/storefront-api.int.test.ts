// The Storefront API's door on a real Postgres (ADR-0018 § Gates and proof; V1 plan § SA0·5): a key names its own shop
// and nothing else, through the real definer and the real lookup; every stop answers the same 404; two keys never share
// a cached entry. Skipped unless INT_DB_HOST is set (the tenancy proof database: npm run verify:tenancy first).
// next/cache is a pass-through here (no Next server): the cached path's tags and purges are proved by
// scripts/verify/api-isr.mjs under `next start`.
import { describe, expect, it, vi } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'

vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: () => {} }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('the Storefront API door', () => {
  it('names the key’s own shop only, and every stop is one 404', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { newKey, shownPrefix } = await import('@/domains/storefront-api/keys')
    const { keyHash } = await import('@/lib/queries/storefront-keys')
    const { apiRequest } = await import('../request')
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const rnd = (n: number) => new Uint8Array(randomBytes(n))
    const tag = String(Date.now() % 1_000_000)
    const shops = [randomUUID(), randomUUID()] as const
    const keys: Record<string, string> = {}
    try {
      for (const [i, t] of shops.entries()) {
        const apex = `int${tag}-${i}.in`
        const d = randomUUID()
        await su`insert into tenants (id, slug, name) values (${t}, ${`int${tag}-${i}`}, ${`Int ${i}`})`
        await su`insert into shop_settings (tenant_id, pickup_pincode) values (${t}, '452009')`
        await su`insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values (${d}, ${t}, ${`checkout.${apex}`}, ${apex}, false, ${randomUUID()}, now(), now())`
        await su`update shop_settings set site_origin = ${`https://${apex}`}, site_domain_id = ${d} where tenant_id = ${t}`
        for (const [name, kind] of [['live', 'public'], ['gone', 'public'], ['test', 'test']] as const) {
          const k = newKey(kind, rnd)
          keys[`${i}:${name}`] = k
          await su`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by, expires_at) values
            (${t}, ${kind}, ${name}, ${keyHash(k)}, ${shownPrefix(k)}, ${randomUUID()}, ${kind === 'test' ? new Date(Date.now() + 86_400_000) : null})`
        }
        await su`update storefront_keys set revoked_at = now(), revoked_by = ${randomUUID()} where tenant_id = ${t} and name = 'gone'`
      }
      const Out = z.strictObject({ shop: z.string() })
      const live = apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: 'probe', schema: Out, run: async (ctx) => ({ shop: ctx.tenantId }) })
      const test = apiRequest({ version: '2026-12', tree: 'test', mode: 'dynamic', resource: 'probe', schema: Out, run: async (ctx) => ({ shop: ctx.tenantId }) })
      const at = (key: string) => ({ params: Promise.resolve({ key }) })
      const r = (url = 'https://api.frrata.shop/2026-12/k/x/probe') => new Request(url)
      const read = async (h: typeof live, key: string) => { const res = await h(r(), at(key)); return { status: res.status, body: await res.text() } }

      expect(await read(live, keys['0:live']!)).toEqual({ status: 200, body: JSON.stringify({ shop: shops[0] }) })
      expect(await read(live, keys['1:live']!)).toEqual({ status: 200, body: JSON.stringify({ shop: shops[1] }) })
      expect(await read(test, keys['0:test']!)).toEqual({ status: 200, body: JSON.stringify({ shop: shops[0] }) })
      const notFound = { status: 404, body: '{"error":"not_found"}' }
      expect(await read(live, keys['0:gone']!)).toEqual(notFound)
      expect(await read(live, newKey('public', rnd))).toEqual(notFound)
      // The store opens: its test key stops; back to Frrata: everything stops.
      await su`update shop_settings set published_at = now() where tenant_id = ${shops[0]}`
      expect(await read(test, keys['0:test']!)).toEqual(notFound)
      expect(await read(test, keys['1:test']!)).toEqual({ status: 200, body: JSON.stringify({ shop: shops[1] }) })
      await su`update shop_settings set site_origin = null, site_domain_id = null where tenant_id = ${shops[1]}`
      expect(await read(live, keys['1:live']!)).toEqual(notFound)
      expect(await read(live, keys['0:live']!)).toEqual({ status: 200, body: JSON.stringify({ shop: shops[0] }) })
    } finally {
      await su`delete from storefront_keys where tenant_id in ${su(shops)}`
      await su`update shop_settings set site_origin = null, site_domain_id = null where tenant_id in ${su(shops)}`
      await su`delete from tenants where id in ${su(shops)}`
      await su.end()
    }
  })

  it('reads the catalogue of the key’s shop only: no other shop, no draft under a live key, no cost', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { newKey, shownPrefix } = await import('@/domains/storefront-api/keys')
    const { keyHash } = await import('@/lib/queries/storefront-keys')
    const { apiRequest } = await import('../request')
    const { RESOURCES, pageParam, handleParam } = await import('../resources')
    const { SENTINELS } = await import('../../../../scripts/cost-sentinels.mjs')
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const rnd = (n: number) => new Uint8Array(randomBytes(n))
    const tag = String(Date.now() % 1_000_000)
    const shops = [randomUUID(), randomUUID()] as const
    const keys: string[] = [], tests: string[] = []
    try {
      for (const [i, t] of shops.entries()) {
        const apex = `cat${tag}-${i}.in`, d = randomUUID()
        await su`insert into tenants (id, slug, name) values (${t}, ${`cat${tag}-${i}`}, ${`Cat ${i}`})`
        await su`insert into shop_settings (tenant_id, pickup_pincode, legal_name) values (${t}, '452009', ${`Legal ${i}`})`
        await su`insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values (${d}, ${t}, ${`checkout.${apex}`}, ${apex}, false, ${randomUUID()}, now(), now())`
        await su`update shop_settings set site_origin = ${`https://${apex}`}, site_domain_id = ${d} where tenant_id = ${t}`
        const [live, draft] = await su`insert into products ${su([
          { tenant_id: t, handle: `live-${i}`, title: `Live kurta ${i}`, status: 'active', published_at: new Date() },
          { tenant_id: t, handle: `draft-${i}`, title: `Draft kurta ${i}`, status: 'draft', published_at: null },
        ])} returning id`
        // Every cost a variant can carry is set: none may come out (ADR-0003).
        await su`insert into variants ${su([live!, draft!].map((p) => ({ tenant_id: t, product_id: p.id, price: 129900, stock: 5, unit_cost: 987654 })))}`
        const k = newKey('public', rnd), tk = newKey('test', rnd)
        keys.push(k); tests.push(tk)
        await su`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by, expires_at) values
          (${t}, 'public', 'Website', ${keyHash(k)}, ${shownPrefix(k)}, ${randomUUID()}, null),
          (${t}, 'test', 'Preview', ${keyHash(tk)}, ${shownPrefix(tk)}, ${randomUUID()}, ${new Date(Date.now() + 86_400_000)})`
      }
      const at = (key: string, more: Record<string, string> = {}) => ({ params: Promise.resolve({ key, ...more }) })
      const r = () => new Request('https://api.frrata.shop/2026-12/k/x/y')
      const live = (res: 'shop' | 'products' | 'product') => apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: res, schema: RESOURCES[res].schema,
        params: (res === 'products' ? pageParam : res === 'product' ? handleParam : undefined) as never, run: RESOURCES[res].run as never })
      const test = (res: 'products' | 'product') => apiRequest({ version: '2026-12', tree: 'test', mode: 'dynamic', resource: res, schema: RESOURCES[res].schema,
        params: (res === 'products' ? pageParam : handleParam) as never, run: RESOURCES[res].run as never })
      const read = async (p: Promise<Response>) => { const res = await p; return { status: res.status, body: await res.text() } }

      const page = await read(live('products')(r(), at(keys[0]!, { n: '1' })))
      expect(page.status).toBe(200)
      expect(JSON.parse(page.body).products.map((x: { handle: string }) => x.handle)).toEqual(['live-0'])
      const shop = await read(live('shop')(r(), at(keys[0]!)))
      expect(JSON.parse(shop.body)).toMatchObject({ legal: { legalName: 'Legal 0' }, siteOrigin: 'https://cat' + tag + '-0.in' })
      // B's product under A's key is "not found"; A's draft under A's live key too; under A's test key it reads.
      expect((await read(live('product')(r(), at(keys[0]!, { handle: 'live-1' })))).status).toBe(404)
      expect((await read(live('product')(r(), at(keys[0]!, { handle: 'draft-0' })))).status).toBe(404)
      expect((await read(test('product')(r(), at(tests[0]!, { handle: 'draft-0' })))).status).toBe(200)
      expect(JSON.parse((await read(test('products')(r(), at(tests[0]!, { n: '1' })))).body).products.map((x: { handle: string }) => x.handle)).toEqual(['live-0'])
      for (const body of [page.body, shop.body, (await read(live('product')(r(), at(keys[0]!, { handle: 'live-0' })))).body]) {
        expect(body).not.toContain('987654')
        for (const k of SENTINELS) expect(body).not.toContain(k)
      }
    } finally {
      await su`delete from storefront_keys where tenant_id in ${su(shops)}`
      await su`update shop_settings set site_origin = null, site_domain_id = null where tenant_id in ${su(shops)}`
      // The shops stay (price history holds them): the proof database is throwaway, and their keys are gone.
      await su.end()
    }
  })
})

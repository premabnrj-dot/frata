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
    const { keyHash } = await import('@/lib/queries/storefront')
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
      await su.end()
    }
  })
})

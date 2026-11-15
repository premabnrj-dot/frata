#!/usr/bin/env node
// =============================================================================
// THE STOREFRONT API'S CACHE, PROVED UNDER `next start` (V1 plan § SA0·4–5; speed and impact reviews 2026-11-15).
// Against a production build made with NEXT_PUBLIC_API_HOST set, and the throwaway proof database:
//   - a live key's answer is a cached copy: the second read is a HIT, and the copy carries the tags a change purges
//     (`skey:<sha256 hex>` and `shop:<tenant>`);
//   - a test key's answer is never cached (no HIT, `private, no-store`);
//   - a key-shaped path for another host, a bad shape or an unknown key is a 404 with the one body.
// Usage: ADMIN_URL=postgres://postgres@localhost:54330/frata_proof API_HOST=api.frrata.test node scripts/verify/api-isr.mjs
// (build first: NEXT_PUBLIC_API_HOST=api.frrata.test DATABASE_URL=… npm run build). Hosts go through node:http:
// undici drops a Host header (frata-gotchas).
// =============================================================================
import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'

const ADMIN_URL = process.env.ADMIN_URL
const API = process.env.API_HOST ?? 'api.frrata.test'
const PORT = Number(process.env.PORT ?? 3191)
if (!ADMIN_URL) { console.error('set ADMIN_URL to the throwaway proof database'); process.exit(2) }
const postgres = createRequire(import.meta.url)('postgres')
const su = postgres(ADMIN_URL, { max: 1, onnotice: () => {} })

// The key's shape, as src/domains/storefront-api/keys.ts makes it (CRC32 of prefix + body, base62).
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const crc32 = (s) => { let c, crc = 0xffffffff; for (let i = 0; i < s.length; i++) { c = (crc ^ s.charCodeAt(i)) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = c ^ (crc >>> 8) } return (crc ^ 0xffffffff) >>> 0 }
const check = (head) => { let n = crc32(head), out = ''; for (let i = 0; i < 6; i++) { out = B62[n % 62] + out; n = Math.floor(n / 62) } return out }
const newKey = (prefix) => { let body = ''; while (body.length < 32) for (const b of randomBytes(32)) { if (b < 248 && body.length < 32) body += B62[b % 62] } return prefix + body + check(prefix + body) }
const hex = (k) => createHash('sha256').update(k).digest('hex')

const get = (path, host = API) => new Promise((res, rej) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path, headers: { host } }, (m) => { let b = ''; m.on('data', (d) => (b += d)); m.on('end', () => res({ status: m.statusCode, headers: m.headers, body: b })) })
  r.on('error', rej); r.end()
})

const problems = []
const expect = (ok, what) => { if (!ok) problems.push(what) }
const tenant = randomUUID(), domain = randomUUID(), tag = String(Date.now() % 1_000_000)
const live = newKey('frs_pub_'), test = newKey('frs_test_')
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: { ...process.env, NEXT_PUBLIC_API_HOST: API }, stdio: ['ignore', 'ignore', 'ignore'], detached: true })
try {
  await su`insert into tenants (id, slug, name) values (${tenant}, ${`isr${tag}`}, 'ISR proof')`
  await su`insert into shop_settings (tenant_id, pickup_pincode, legal_name) values (${tenant}, '452009', 'ISR Proof LLP')`
  await su`insert into shop_domains (id, tenant_id, host, apex, with_www, claimed_by, proved_at, cert_ok_at) values (${domain}, ${tenant}, ${`checkout.isr${tag}.in`}, ${`isr${tag}.in`}, false, ${randomUUID()}, now(), now())`
  await su`update shop_settings set site_origin = ${`https://isr${tag}.in`}, site_domain_id = ${domain} where tenant_id = ${tenant}`
  await su`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by, expires_at) values
    (${tenant}, 'public', 'Website', ${hex(live)}, ${live.slice(0, 14)}, ${randomUUID()}, null),
    (${tenant}, 'test', 'Preview', ${hex(test)}, ${test.slice(0, 15)}, ${randomUUID()}, ${new Date(Date.now() + 86_400_000)})`
  for (let i = 0; i < 60; i++) { try { await get('/2026-12/openapi.json'); break } catch { await new Promise((r) => setTimeout(r, 500)) } }

  const a = await get(`/2026-12/k/${live}/shop`), b = await get(`/2026-12/k/${live}/shop`)
  expect(a.status === 200 && JSON.parse(a.body).legal?.legalName === 'ISR Proof LLP', `live shop answered ${a.status} ${a.body.slice(0, 120)}`)
  expect(b.headers['x-nextjs-cache'] === 'HIT', `second live read was ${b.headers['x-nextjs-cache']}, not a HIT`)
  expect(a.headers['access-control-allow-origin'] === '*' && !a.headers['set-cookie'], 'live read: CORS * and no cookie')
  // Next 15.5 keeps a cached route's copy under .next/server/route-cache/APP_ROUTE/<build>/$/<path>.meta.
  const find = (dir) => { try { return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? find(p) : p.endsWith(`k/${live}/shop.meta`) ? [p] : [] }) } catch { return [] } }
  const meta = find('.next/server')[0]
  const tags = meta ? String(JSON.parse(readFileSync(meta, 'utf8')).headers?.['x-next-cache-tags'] ?? '') : ''
  expect(tags.includes(`skey:${hex(live)}`), `the cached copy lacks skey:<hex> (tags: ${tags || 'none'})`)
  expect(tags.includes(`shop:${tenant}`), `the cached copy lacks shop:<tenant> (tags: ${tags || 'none'})`)

  const t1 = await get(`/2026-12/k/${test}/shop`), t2 = await get(`/2026-12/k/${test}/shop`)
  expect(t1.status === 200 && t2.status === 200, `test key answered ${t1.status}/${t2.status}`)
  expect(t2.headers['x-nextjs-cache'] !== 'HIT' && /private, no-store/.test(String(t2.headers['cache-control'])), `a test answer was cached (${t2.headers['x-nextjs-cache']}, ${t2.headers['cache-control']})`)

  const unknown = await get(`/2026-12/k/${newKey('frs_pub_')}/shop`)
  expect(unknown.status === 404 && unknown.body === '{"error":"not_found"}', `an unknown key answered ${unknown.status} ${unknown.body.slice(0, 60)}`)
  expect((await get(`/2026-12/k/frs_pub_short/shop`)).status === 404, 'a bad shape did not 404')
  expect((await get(`/2026-12/k/${live}/shop`, 'app.frrata.test')).status === 404, 'the console host answered a versioned path')
  expect((await get(`/api/storefront/2026-12/k/${live}/shop`, `isr${tag}.in`)).status === 404, 'a shop host reached the API handlers')
  const o = await get('/2026-12/openapi.json')
  expect(o.status === 200 && JSON.parse(o.body).openapi === '3.1.0', 'openapi.json')
} finally {
  await su`delete from storefront_keys where tenant_id = ${tenant}`
  await su`update shop_settings set site_origin = null, site_domain_id = null where tenant_id = ${tenant}`
  await su.end()
  // npx starts next-server as a child: end the whole group (frata-gotchas: pkill misses the child).
  try { process.kill(-server.pid, 'SIGTERM') } catch { /* already gone */ }
}
if (problems.length) { for (const p of problems) console.error(`FAIL ${p}`); process.exit(1) }
console.log('api-isr — live answers are cached copies tagged skey:<hex> and shop:<tenant>; test answers never cached; refusals one 404')
process.exit(0)

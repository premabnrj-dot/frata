// The build key the session's vault injects as Frrata-Key is never reflected (plan docs/plans/2026-11-22-v3a-runtime.md R5;
// security review of the plan): not in a body or a header of any answer of the header tree (found, not found, busy, an
// error, an oversized key), no header-tree route answers OPTIONS or TRACE itself (Next's automatic answers carry no
// request header), and a storefront API path on any host but the API host is refused before a route runs. Next's own
// OPTIONS answer and the gateway are not run here: what the edge does with a wrong Host is R8's probe.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { newKey } from '@/domains/storefront-api/keys'
import { routeFor } from '@/domains/tenancy/host'

const rows = new Map<string, { keyId: string; tenantId: string; kind: 'public' | 'test' | 'build'; expiresAt: string | null }>()
const plan = { lookupFails: false, busy: false }
vi.mock('@/lib/queries/storefront-keys', () => ({
  keyHash: (k: string) => `h${k.length}`,
  storefrontKeyFor: vi.fn(async (k: string) => rows.get(k) ?? null),
  storefrontKeyNow: vi.fn(async (k: string) => { if (plan.lookupFails) throw new Error(`lookup ${k}`); return rows.get(k) ?? null }),
}))
vi.mock('@/lib/env', async (orig) => ({ ...(await orig<object>()), STOREFRONT_PREVIEW_KEY: Buffer.alloc(32, 7) }))
vi.mock('@/lib/queries/storefront-api', () => ({ markKeySeen: vi.fn(async () => {}), siteOriginFor: vi.fn(async () => null) }))
vi.mock('@/lib/db/rate-limit', () => ({
  LIMITS: { apiMissIp: {}, apiMissKey: {}, apiTestKey: {}, apiSearchIp: {}, apiPreviewKey: {} },
  overLimit: vi.fn(async () => false),
  withinLimit: vi.fn(async () => !plan.busy),
}))
const { apiRequest } = await import('@/lib/storefront-api/request')

const BUILD = newKey('build', (n) => new Uint8Array(randomBytes(n)))
const A = '11111111-1111-1111-1111-111111111111'
const Shop = z.object({ name: z.string() }).strict()
const noKey = { params: Promise.resolve({}) }
const req = (key: string) => new Request('https://api.frrata.shop/2026-12/h/shop', { headers: { 'Frrata-Key': key, Origin: 'https://evil.example' } })

async function reflects(r: Response, key: string): Promise<boolean> {
  const text = await r.text()
  const heads = [...r.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')
  return text.includes(key) || heads.includes(key) || text.includes(key.slice(-16)) || heads.includes(key.slice(-16))
}

describe('Frrata-Key is never reflected', () => {
  const ok = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'shop', schema: Shop, run: async () => ({ name: 'Kesar Studio' }) })
  const throws = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'shop', schema: Shop, run: async () => { throw new Error(`boom ${BUILD}`) } })
  const badShape = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'shop', schema: Shop, run: async () => ({ name: BUILD.length, extra: 1 }) as never })

  it('in no answer of the header tree: found, not found, busy, lookup error, run error, bad shape, oversized', async () => {
    rows.set(BUILD, { keyId: 'k3', tenantId: A, kind: 'build', expiresAt: null })
    const huge = BUILD + 'x'.repeat(16 * 1024)
    const answers: Response[] = []
    answers.push(await ok(req(BUILD), noKey))
    expect(answers[0]!.status).toBe(200)
    answers.push(await ok(req(BUILD.slice(0, -1) + (BUILD.endsWith('a') ? 'b' : 'a')), noKey)) // unknown
    answers.push(await ok(req(huge), noKey)) // oversized
    plan.busy = true; answers.push(await ok(req(BUILD), noKey)); plan.busy = false
    plan.lookupFails = true; answers.push(await ok(req(BUILD), noKey)); plan.lookupFails = false
    answers.push(await throws(req(BUILD), noKey))
    answers.push(await badShape(req(BUILD), noKey))
    // What each answer is (security review of R5, LOW-3): a rejection would fail here, never pass as a clean 500.
    expect(answers.map((r) => r.status)).toEqual([200, 404, 404, 429, 500, 500, 500])
    for (const r of answers) {
      expect(await reflects(r.clone(), BUILD)).toBe(false)
      expect([...r.headers.keys()].filter((k) => k.startsWith('access-control-'))).toEqual([])
    }
  })

  it('no header-tree route handles OPTIONS or TRACE itself: GET only', () => {
    const files: string[] = []
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n === 'route.ts') files.push(p) } }
    for (const v of readdirSync('src/app/api/storefront')) if (statSync(join('src/app/api/storefront', v, 'h')).isDirectory()) walk(join('src/app/api/storefront', v, 'h'))
    expect(files.length).toBeGreaterThan(5)
    for (const f of files) {
      const handlers = [...readFileSync(f, 'utf8').matchAll(/export\s+(?:const|async function|function)\s+([A-Z]+)\b/g)].map((m) => m[1])
      expect({ f, handlers }).toEqual({ f, handlers: ['GET'] })
    }
  })

  it('a storefront API path on any other host is refused before a route runs', () => {
    const C = 'app.frata.in', API = 'api.frrata.shop'
    for (const host of ['app.frata.in', 'kesar.frata.store', 'evil.example', 'api.frrata.shop.evil.example', null]) {
      expect(routeFor(host, '/api/storefront/2026-12/h/shop', C, false, 'frata.store', 'ekcode.in', API)).toEqual({ kind: 'not_found' })
    }
    expect(routeFor(API, '/2026-12/h/shop', C, false, 'frata.store', 'ekcode.in', API)).toEqual({ kind: 'api' })
  })
})

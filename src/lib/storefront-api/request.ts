import 'server-only'
import type { z } from 'zod'
import { keyShape, type KeyKind } from '@/domains/storefront-api/keys'
import { API_VERSIONS, type ApiVersion } from '@/domains/storefront-api/versions'
import { storefrontKeyFor, storefrontKeyNow } from '@/lib/queries/storefront-keys'
import { PREVIEW_HEADER, type PreviewEntry } from '@/domains/storefront-api/preview'
import { previewOk } from './preview-token'
import { markKeySeen, siteOriginFor } from '@/lib/queries/storefront-api'
import { LIMITS, overLimit, withinLimit } from '@/lib/db/rate-limit'
import { ipFrom } from '@/lib/http/client-ip'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/storefront-api/request.ts — THE ONE DOOR OF THE STOREFRONT API (ADR-0018 § 5; V1 plan § SA0·4).
//
// Every API route handler is `export const GET = apiRequest({...})` (check:tenant § API, check:api). The shop comes
// from ONE place: the definer's row for the key in the path (storefrontKeyFor), never from a host, a header, a query or
// a body. A handler gets `ctx` (shop, key, kind, version, now) and its parsed path params, never the Request, and its
// answer leaves only as the output of its Zod schema's parse() (closed schemas: check:api).
//
// Two trees, kept apart by next.config's rewrite (src/domains/tenancy/host.ts apiRewrites):
//   'live' — live keys, `k/`. Its routes are cached copies (mode 'isr': revalidate in the route file) that NEVER touch
//            the request (a header read there is a runtime error, and an echoed Origin or a per-IP answer would be
//            cached for everyone); CORS is a static `*` without credentials (public data; CORS is not authentication);
//            Next owns Cache-Control. One exception, search (mode 'dynamic'): it varies by its query, so it reads the
//            request, is limited per network, and answers `public, s-maxage=60` so repeats are CDN hits by URL.
//   'test' — test keys, `t/`: never cached (`private, no-store`); drafts through the preview loaders; CORS only to the
//            shop's own website or http://localhost:<port>; limits per network (ipBucket), failing closed.
//   'preview' (either tree, SA1b D·4; ADR-0018 § 12): a hidden page or the FAQ's draft under a token Frrata signed in the
//            console, read from the `Frrata-Preview` header. Its own branch, never the live one: `private, no-store`, no
//            CORS (a site's server asks), the key looked up uncached (a stop applies at once), limited per network, no
//            last-seen write. The token must name this store and key (in its MAC) and this entry, for ≤ 10 minutes.
// Every refusal is the same 404 body, whatever the reason (bad shape, unknown, deleted, expired, wrong tree), so a key
// can't be probed. Logs carry the key id, never the key or the path.
// =============================================================================

/** A filter's grammar error (SA1b D·5; api-contract review M1): `params` returns this to answer 400 naming the
 *  parameter. Only after the key checks out, so it tells nothing about keys. The one exception to "every refusal is
 *  the one 404". */
export class BadParam { constructor(readonly param: string) {} }

export type ApiCtx = { tenantId: string; keyId: string; keyKind: KeyKind; version: ApiVersion; now: Date }
export type ApiTree = 'live' | 'test'
export type ApiMode = 'isr' | 'dynamic' | 'preview'
type Params = Promise<Record<string, string | string[] | undefined>>

const LOCALHOST = /^http:\/\/localhost(:\d{1,5})?$/

const NOT_FOUND = JSON.stringify({ error: 'not_found' })

function answer(status: number, body: string, headers: Record<string, string>): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers } })
}

/**
 * Builds a route handler. `params` turns the route's own path params (the key aside) into what `run` needs, or null
 * (a 404, before any read). `run` returns the resource, or null for "not found" in this shop.
 */
export function apiRequest<P, S extends z.ZodType>(opts: {
  version: ApiVersion
  tree: ApiTree
  /** 'isr' (live tree only): a cached copy that never reads the request. 'dynamic': reads it (search, every test route).
   *  'preview': a token-bound draft (either tree). */
  mode: ApiMode
  resource: string
  schema: S
  params?: (raw: Record<string, string | string[] | undefined>, search: URLSearchParams | null) => P | BadParam | null
  /** The dynamic tree's per-network limit for this resource beyond the test key's own (search). */
  limit?: 'search'
  /** mode 'preview' only: the one entry these params name (the token must name it too). */
  entry?: (params: P) => PreviewEntry | null
  run: (ctx: ApiCtx, params: P) => Promise<z.input<S> | null>
}) {
  return async function handle(req: Request, route: { params: Params }): Promise<Response> {
    const test = opts.tree === 'test'
    const preview = opts.mode === 'preview'
    const dynamic = opts.mode === 'dynamic' || test || preview
    const base: Record<string, string> = { 'Frrata-Api-Version': opts.version }
    if (test || preview) base['Cache-Control'] = 'private, no-store'
    else base['Access-Control-Allow-Origin'] = '*'
    if (!test && !preview && dynamic) base['Cache-Control'] = 'public, s-maxage=60'
    const refuse = (status = 404, body = NOT_FOUND, extra: Record<string, string> = {}) => answer(status, body, { ...base, ...extra })

    if (!(API_VERSIONS as readonly string[]).includes(opts.version)) return refuse()
    const raw = await route.params
    const key = typeof raw.key === 'string' ? raw.key : ''
    const shape = keyShape(key)
    if (!shape || (shape.kind === 'test') !== test || (test && opts.mode === 'isr') || (preview && !opts.entry)) return refuse()

    // Only the dynamic tree reads the request: the network, for its limits, and the Origin, for CORS.
    const ip = dynamic ? ipFrom(req.headers) : ''
    let row: Awaited<ReturnType<typeof storefrontKeyFor>>
    try {
      if (dynamic && await overLimit(LIMITS.apiMissIp, ip, new Date(), true)) return refuse(429, JSON.stringify({ error: 'busy' }), { 'Retry-After': '60' })
      row = preview ? await storefrontKeyNow(key) : await storefrontKeyFor(key)
    } catch (err) {
      // Never the raw error (its parameters carry the key's hash): security review LOW-4. A cached route rethrows, so
      // Next keeps serving its last good copy rather than caching a failure for the hour (LOW-1).
      console.error('[api]', opts.resource, 'lookup', errName(err))
      if (!dynamic) throw new Error('storefront api: lookup failed')
      return refuse(500, JSON.stringify({ error: 'unavailable' }))
    }
    if (!row || row.kind !== shape.kind) {
      if (dynamic) await withinLimit(LIMITS.apiMissIp, ip, new Date(), true)
      return refuse()
    }
    const ctx: ApiCtx = { tenantId: row.tenantId, keyId: row.keyId, keyKind: row.kind, version: opts.version, now: new Date() } // clock-ok: server

    let cors: Record<string, string> = {}
    if (preview && !(await withinLimit(LIMITS.apiPreviewKey, ctx.keyId, ctx.now, true))) return refuse(429, JSON.stringify({ error: 'busy' }), { 'Retry-After': '60' })
    if (test && !preview && !(await withinLimit(LIMITS.apiTestIp, ip, ctx.now, true))) return refuse(429, JSON.stringify({ error: 'busy' }), { 'Retry-After': '60' })
    if (dynamic && opts.limit === 'search' && !(await withinLimit(LIMITS.apiSearchIp, ip, ctx.now, true))) return refuse(429, JSON.stringify({ error: 'busy' }), { 'Retry-After': '60' })
    if (test && !preview) {
      const origin = req.headers.get('origin')
      const site = origin && !LOCALHOST.test(origin) ? await siteOriginFor(ctx.tenantId).catch((e) => { console.error('[api]', opts.resource, 'origin', errName(e)); return null }) : null
      if (origin && (LOCALHOST.test(origin) || origin === site)) cors = { 'Access-Control-Allow-Origin': origin }
      cors.Vary = 'Origin'
    }

    const search = dynamic ? new URL(req.url).searchParams : null
    const parsed = opts.params ? opts.params(raw, search) : ({} as P)
    if (parsed === null) return refuse(404, NOT_FOUND, cors)
    if (parsed instanceof BadParam) return refuse(400, JSON.stringify({ error: 'bad_filter', param: parsed.param.replace(/[^a-z_]/g, '').slice(0, 20) || 'query' }), cors)
    if (preview) {
      const entry = opts.entry!(parsed)
      if (!entry || !previewOk(req.headers.get(PREVIEW_HEADER), { tenantId: ctx.tenantId, keyId: ctx.keyId }, entry, ctx.now)) {
        console.error('[api] preview refused', `key=${ctx.keyId}`)
        return refuse()
      }
    }
    // A handler's params never carry a shop (tenancy audit 2026-11-15 H1): the shop is ctx.tenantId, from the key.
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).some((k) => /tenant|shop/i.test(k))) {
      console.error('[api]', opts.resource, 'params_name_a_shop', `key=${ctx.keyId}`)
      return refuse(500, JSON.stringify({ error: 'unavailable' }), cors)
    }
    try {
      const result = await opts.run(ctx, parsed)
      if (result === null) return refuse(404, NOT_FOUND, cors)
      const body = JSON.stringify(opts.schema.parse(result))
      if (!test && !dynamic && !preview) await markKeySeen(ctx)
      return answer(200, body, { ...base, ...cors })
    } catch (err) {
      console.error('[api]', opts.resource, errName(err), `key=${ctx.keyId}`)
      if (!dynamic) throw new Error('storefront api: read failed') // keep the last good copy (LOW-1)
      return refuse(500, JSON.stringify({ error: 'unavailable' }), cors)
    }
  }
}

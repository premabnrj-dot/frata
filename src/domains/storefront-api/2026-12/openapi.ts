// =============================================================================
// FILE: src/domains/storefront-api/2026-12/openapi.ts
//
// THE PUBLISHED DESCRIPTION OF VERSION 2026-12 (spec § 3, § 8): generated from the same closed schemas the answers are
// parsed with (zod 4's toJSONSchema), so it can't drift from what the API returns. No shop data; served at
// api.frrata.shop/2026-12/openapi.json.
// =============================================================================

import { z } from 'zod'
import * as S from './schemas'
import { MAX_PAGE } from './map'

/** Our answers are parsed closed; the published description is open (api-contract review M1): a version may add a
 *  field or a block kind, so a site that validates against this file must not refuse one it doesn't know. */
const open = (x: unknown): unknown => Array.isArray(x) ? x.map(open)
  : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k, v]) => !(k === 'additionalProperties' && v === false)).map(([k, v]) => [k, open(v)])) : x
const json = (schema: z.ZodType) => open(z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' }))
const ok = (schema: z.ZodType, description: string) => ({
  description, content: { 'application/json': { schema: json(schema) } },
})
const err = (code: string) => ({ type: 'object', properties: { error: { const: code } }, required: ['error'], additionalProperties: false })
const badFilter = { description: 'The query broke a rule. The answer names the parameter. Send each once, in this order, and leave out defaults. The order is collection, size, colour, price, stock, sort.', content: { 'application/json': { schema: { type: 'object', properties: { error: { const: 'bad_filter' }, param: { type: 'string' } }, required: ['error', 'param'], additionalProperties: false } } } }
const notFound = { description: 'Unknown key, product or page. All three get this same answer.', content: { 'application/json': { schema: err('not_found') } } }
const busy = { description: 'Too many requests from your network or under your key. Wait as long as Retry-After says.', headers: { 'Retry-After': { schema: { type: 'integer' } } }, content: { 'application/json': { schema: err('busy') } } }
const unavailable = { description: 'We couldn’t answer just now. Try again in a minute.', content: { 'application/json': { schema: err('unavailable') } } }
const key = { name: 'key', in: 'path', required: true, description: 'Your store’s live key (frs_pub_…) or, before it opens, a test key (frs_test_…).', schema: { type: 'string', pattern: '^frs_(pub|test)_[0-9A-Za-z]{38}$' } }
const n = { name: 'n', in: 'path', required: true, schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE } }
const handle = { name: 'handle', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 100 } }
const pageHandle = { name: 'handle', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$', maxLength: 60 } }
const preview = { name: 'Frrata-Preview', in: 'header', required: true, description: 'The preview token from the store’s console. It opens one page or the FAQ, under one key, for 10 minutes. A page’s token never opens the FAQ. A missing or old one gets the same 404.', schema: { type: 'string' } }
const get = (summary: string, schema: z.ZodType, params: object[] = []) => ({ get: { summary, parameters: [key, ...params], responses: { 200: ok(schema, summary), 404: notFound, 429: busy, 500: unavailable } } })

/** The header tree (G·2; ADR-0018's build-key amendment): the same resources, a build key in the Frrata-Key header in
 *  place of the key in the path. Drafts included, never cached, read from a server only (no CORS headers). */
const BUILD_NOTE = 'Send a build key (frs_build_…) in the Frrata-Key header. It reads drafts and hidden pages too. Its answers are never cached, and no browser may read them.'
const byHeader = (paths: Record<string, { get: { summary: string; parameters: object[] } }>) =>
  Object.fromEntries(Object.entries(paths).filter(([p]) => !p.includes('/preview/')).map(([p, v]) => [p.replace('/k/{key}', ''),
    { get: { ...v.get, summary: `${v.get.summary}. ${BUILD_NOTE}`, parameters: v.get.parameters.filter((x) => x !== key), security: [{ buildKey: [] }] } }]))

export function openApi() {
  const keyed = keyPaths()
  return {
    openapi: '3.1.0',
    info: { title: 'Frrata Storefront', version: '2026-12', description: 'Read a store’s public catalogue, content and pages. Prices are in paise. Render text as text, never as HTML. Objects may gain fields. Lists of values may grow. New block kinds may appear. Ignore what you don’t know. A test key also opens a draft product by its handle. A hidden page opens under preview/ with the Frrata-Preview header, or under a build key. Checkout stays on the store’s checkout address. The bag link in the store’s cart field sends a shopper’s bag there.' },
    servers: [{ url: 'https://api.frrata.shop/2026-12' }],
    components: { securitySchemes: { buildKey: { type: 'apiKey', in: 'header', name: 'Frrata-Key', description: BUILD_NOTE } } },
    paths: { ...keyed, ...byHeader(keyed) },
  }
}

/** The paths under a key in the path (live and test keys). */
function keyPaths() {
  return {
      '/k/{key}/shop': get('The store, with the legal details every page must show', S.Shop),
      '/k/{key}/products/page/{n}': get('Listed products, 48 a page', S.Page, [n]),
      '/k/{key}/products/{handle}': get('One product. Its handle in the answer is its current address.', S.Product, [handle]),
      '/k/{key}/collections': get('The store’s collections', S.Collections),
      '/k/{key}/collections/{handle}/page/{n}': get('A collection’s listed products, 48 a page', S.CollectionPage, [handle, n]),
      '/k/{key}/offers': get('The offer in the store’s bar, while it runs', S.Offers),
      '/k/{key}/content': get('The store’s bars, menus, Contact line and pages', S.Content),
      '/k/{key}/pages/{handle}': get('One of the store’s pages, block by block', S.StorePage, [pageHandle]),
      '/k/{key}/faq': get('The store’s questions, answered from its Settings', S.Faq),
      '/k/{key}/facets': get('The store’s filter menu. Sizes, colour families and price bands, with counts.', S.Facets),
      '/k/{key}/filter/page/{n}': { get: { ...get('Listed products by size, colour, price or stock, 48 a page. A value the store doesn’t have now gives an empty page.', S.FilterPage, [n,
        ...(['collection', 'size', 'colour'] as const).map((name) => ({ name, in: 'query', required: false, schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: name === 'collection' ? 100 : 40, description: name === 'collection' ? 'A handle' : 'A `value` from `facets`' } })),
        { name: 'price', in: 'query', required: false, schema: { type: 'string', pattern: '^[a-z0-9]{1,10}$', description: 'A band `id` from `facets`. New ids may appear.' } },
        { name: 'stock', in: 'query', required: false, schema: { type: 'string', enum: ['in'], description: '`in` shows in-stock products only' } },
        { name: 'sort', in: 'query', required: false, schema: { type: 'string', enum: ['new', 'price_asc', 'price_desc'], description: '`new`, `price_asc`, `price_desc`. Leave it out for `featured`, the store’s own order (a collection’s, with `collection`).' } }]).get,
        responses: { ...get('', S.FilterPage).get.responses, 200: ok(S.FilterPage, 'A filtered page'), 400: badFilter } } },
      '/k/{key}/preview/pages/{handle}': { get: { ...get('A hidden page as it stands, under a preview token', S.StorePage, [pageHandle, preview]).get } },
      '/k/{key}/preview/faq': { get: { ...get('The FAQ as it stands, under a preview token', S.Faq, [preview]).get } },
      '/k/{key}/search': get('Listed products matching every word of q', S.Search, [{ name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1, maxLength: 60 } }]),
  }
}

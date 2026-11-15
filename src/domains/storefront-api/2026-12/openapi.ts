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

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' })
const ok = (schema: z.ZodType, description: string) => ({
  description, content: { 'application/json': { schema: json(schema) } },
})
const notFound = { description: 'Unknown key, product or page. Every refusal is this one body.', content: { 'application/json': { schema: { type: 'object', properties: { error: { const: 'not_found' } }, required: ['error'] } } } }
const key = { name: 'key', in: 'path', required: true, description: 'Your store’s live key (frs_pub_…) or, before it opens, a test key (frs_test_…).', schema: { type: 'string', pattern: '^frs_(pub|test)_[0-9A-Za-z]{38}$' } }
const n = { name: 'n', in: 'path', required: true, schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE } }
const handle = { name: 'handle', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 100 } }
const get = (summary: string, schema: z.ZodType, params: object[] = []) => ({ get: { summary, parameters: [key, ...params], responses: { 200: ok(schema, summary), 404: notFound } } })

export function openApi() {
  return {
    openapi: '3.1.0',
    info: { title: 'Frrata Storefront', version: '2026-12', description: 'Read a store’s public catalogue. Prices are in paise. Render text as text, never as HTML. New availability kinds may appear. A test key also opens a draft by its handle.' },
    servers: [{ url: 'https://api.frrata.shop/2026-12' }],
    paths: {
      '/k/{key}/shop': get('The store, with the legal details every page must show', S.Shop),
      '/k/{key}/products/page/{n}': get('Listed products, 48 a page', S.Page, [n]),
      '/k/{key}/products/{handle}': get('One product. Its handle in the answer is its current address.', S.Product, [handle]),
      '/k/{key}/collections': get('The store’s collections', S.Collections),
      '/k/{key}/collections/{handle}/page/{n}': get('A collection’s listed products, 48 a page', S.CollectionPage, [handle, n]),
      '/k/{key}/offers': get('The offer in the store’s bar, while it runs', S.Offers),
      '/k/{key}/search': get('Listed products matching every word of q', S.Search, [{ name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1, maxLength: 60 } }]),
    },
  }
}

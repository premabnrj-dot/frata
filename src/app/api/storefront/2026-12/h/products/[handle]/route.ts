import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES, handleParam } from '@/lib/storefront-api/resources'

// Build keys, in the Frrata-Key header: drafts, never cached, from a server only (G·2; ADR-0018's build-key amendment).
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'product', schema: RESOURCES.product.schema, params: handleParam, run: RESOURCES.product.run })

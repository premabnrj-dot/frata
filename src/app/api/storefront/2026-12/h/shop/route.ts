import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES } from '@/lib/storefront-api/resources'

// Build keys, in the Frrata-Key header: drafts, never cached, from a server only (G·2; ADR-0018's build-key amendment).
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'shop', schema: RESOURCES.shop.schema, run: RESOURCES.shop.run })

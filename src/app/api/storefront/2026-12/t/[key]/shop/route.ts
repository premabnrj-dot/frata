import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES } from '@/lib/storefront-api/resources'

// Test keys: drafts, never cached. Spec § 3; V1 plan § SA1·3.
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'test', mode: 'dynamic', resource: 'shop', schema: RESOURCES.shop.schema, run: RESOURCES.shop.run })

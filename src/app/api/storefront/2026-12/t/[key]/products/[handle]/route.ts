import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES, handleParam } from '@/lib/storefront-api/resources'

// Test keys: drafts, never cached. Spec § 3; V1 plan § SA1·3.
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'test', mode: 'dynamic', resource: 'product', schema: RESOURCES.product.schema, params: handleParam, run: RESOURCES.product.run })

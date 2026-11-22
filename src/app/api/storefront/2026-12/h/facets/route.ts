import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES } from '@/lib/storefront-api/resources'

// Test keys: the filter menu, never cached (SA1b D·5).
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'facets', schema: RESOURCES.facets.schema, run: RESOURCES.facets.run })

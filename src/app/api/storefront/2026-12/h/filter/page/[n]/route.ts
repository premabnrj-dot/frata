import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES, filterParam } from '@/lib/storefront-api/resources'

// Test keys: a filtered list, never cached (SA1b D·5).
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'header', mode: 'dynamic', resource: 'filter', schema: RESOURCES.filter.schema, params: filterParam, limit: 'search', run: RESOURCES.filter.run })

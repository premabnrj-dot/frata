import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES, filterParam } from '@/lib/storefront-api/resources'

// Live keys, a filtered list (SA1b D·5): varies by its query, cached at the CDN by URL like search; one URL per filter.
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'live', mode: 'dynamic', resource: 'filter', schema: RESOURCES.filter.schema, params: filterParam, limit: 'search', run: RESOURCES.filter.run })

import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES, searchParam } from '@/lib/storefront-api/resources'

// Live keys, search: varies by its query, cached at the CDN by URL. Spec § 3; V1 plan § SA1·3.
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'live', mode: 'dynamic', resource: 'search', schema: RESOURCES.search.schema, params: searchParam, limit: 'search', run: RESOURCES.search.run })

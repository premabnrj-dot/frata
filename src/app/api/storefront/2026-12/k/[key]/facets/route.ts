import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES } from '@/lib/storefront-api/resources'

// Live keys, a cached copy: the store's filter menu (SA1b D·5). Never reads the request (check:api).
export const maxDuration = 10
export const revalidate = 3600
export const generateStaticParams = () => []
export const GET = apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: 'facets', schema: RESOURCES.facets.schema, run: RESOURCES.facets.run })

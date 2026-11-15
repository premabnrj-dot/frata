import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES } from '@/lib/storefront-api/resources'

// Live keys, a cached copy: never reads the request (check:api). Spec § 3; V1 plan § SA1·3.
export const maxDuration = 10
export const revalidate = 3600
export const generateStaticParams = () => []
export const GET = apiRequest({ version: '2026-12', tree: 'live', mode: 'isr', resource: 'collections', schema: RESOURCES.collections.schema, run: RESOURCES.collections.run })

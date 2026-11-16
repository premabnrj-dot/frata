import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES, handleParam } from '@/lib/storefront-api/resources'

// A hidden page under a signed preview token (ADR-0018 § 12; SA1b D·4): never cached, read from the Frrata-Preview header.
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'test', mode: 'preview', resource: 'preview_page', schema: RESOURCES.previewPage.schema, params: handleParam, entry: RESOURCES.previewPage.entry, run: RESOURCES.previewPage.run })

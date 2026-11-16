import { apiRequest } from '@/lib/storefront-api/request'
import { RESOURCES } from '@/lib/storefront-api/resources'

// The FAQ's draft under a signed preview token (ADR-0018 § 12; SA1b D·4): never cached, read from the Frrata-Preview header.
export const maxDuration = 10
export const dynamic = 'force-dynamic'
export const GET = apiRequest({ version: '2026-12', tree: 'live', mode: 'preview', resource: 'preview_faq', schema: RESOURCES.previewFaq.schema, entry: RESOURCES.previewFaq.entry, run: RESOURCES.previewFaq.run })

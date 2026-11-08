import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { previewPage } from '@/components/storefront/preview-body'
import { ShopShell } from '@/components/storefront/shell'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { previewCatalogue, previewRevision, previewShop } from '@/lib/queries/storefront'
import { circlesOf, themeOf } from '@/lib/themes/page-look'
import { manifestOf } from '@/domains/themes/catalogue'
import { isListed } from '@/domains/storefront/listing'
import { withSampleImages, withSamples } from '@/lib/themes/sample'
import { PreviewBridge } from './bridge'

// =============================================================================
// The customizer's preview of ONE revision of the member's own shop (themes spec § Preview): framed only by the
// console itself (next.config.ts: SAMEORIGIN here, DENY everywhere else), never cached, never indexed. The revision
// id comes from the URL but is read inside the member's own shop: another shop's id and a missing id both 404.
// Its own route group: no console chrome, just the shop.
// =============================================================================

export const metadata: Metadata = { title: 'Look preview', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function LookPreview({ params }: { params: Promise<{ revision: string; path?: string[] }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) notFound()
  const { revision, path = [] } = await params
  const tenantId = auth.membership.tenantId
  const [shop, rev] = await Promise.all([previewShop(tenantId), previewRevision(tenantId, revision)])
  if (!shop || !rev) notFound()
  const base = `/console/theme-preview/${revision}`
  const href = (p: string) => (p === '/' ? base : `${base}${p}`)
  const now = new Date()
  // A theme with samples (2.0) fills an empty shop with sample pieces and missing photos with sample scenes, here only.
  const resolved = themeOf(shop, rev)
  const samples = !!manifestOf(resolved.key, resolved.version)?.samples
  const theme = samples ? withSampleImages(resolved) : resolved
  const cat = theme.settings.header === 'circles' ? await previewCatalogue(tenantId) : null
  const circles = cat ? circlesOf(samples ? withSamples(cat, cat.products.filter((p) => isListed(p, now)).length, now) : cat, now) : []
  const { body } = await previewPage({ tenantId, shop, path, href, now, theme, samples })
  return (
    <>
      <ShopShell shop={shop} href={href} theme={theme} circles={circles} live>{body}</ShopShell>
      <PreviewBridge />
    </>
  )
}

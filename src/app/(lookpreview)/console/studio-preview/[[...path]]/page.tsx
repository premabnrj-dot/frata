import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { previewPage } from '@/components/storefront/preview-body'
import { ShopShell } from '@/components/storefront/shell'
import { requireStudio, StudioUnbound, withStudio } from '@/lib/studio/with-studio'
import { previewCatalogue, previewLook, previewShop } from '@/lib/queries/storefront'
import { previewContent } from '@/lib/queries/content'
import { manifestsFor } from '@/lib/themes/manifests'
import { shellNeedsCatalogue, shellPictures, themeOf } from '@/lib/themes/page-look'
import { shellContentOf } from '@/domains/content/bar'

// =============================================================================
// FILE: src/app/(lookpreview)/console/studio-preview/[[...path]]/page.tsx — STUDIO'S PREVIEW PANE: THE STORE ONLY
// (owner 2026-11-23: "this should be only website preview"). The same store and the same drafts as the console's own
// preview (/console/preview), in a document with no console around it: this route group has no console layout, so no
// nav rail, no "Building for" bar, no Hand over, no Back to products.
//
// Who: requireStudio() only, so the person Studio admits, on the store they are working on (the store comes from their
// own sign-in, never from the URL: the path picks a page inside that store and nothing else). Anyone else gets a 404.
// Framed only by the console host itself (next.config.ts and middleware.ts: frame-ancestors 'self' and SAMEORIGIN here,
// DENY everywhere else and on every other host); Studio frames it sandboxed with no scripts, no forms, no popups and no
// top navigation (studio-app.tsx), so a link can only move the frame within this preview, and every console or Admin page
// refuses to be framed (DENY).
// =============================================================================

export const metadata: Metadata = { title: 'Store preview', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const BASE = '/console/studio-preview'
const href = (p: string) => (p === '/' ? BASE : `${BASE}${p}`)

export default async function StudioPreview({ params }: { params: Promise<{ path?: string[] }> }) {
  const auth = await requireStudio()
  if (!auth.ok) notFound()
  // The database's own check that this person is bound to this store, as every Studio read has (tenancy review LOW):
  // a partner member whose link or assignment fails it sees nothing here.
  const bound = await withStudio(auth, async () => true).catch((e) => { if (e instanceof StudioUnbound) return false; throw e })
  if (!bound) notFound()
  const tenantId = auth.tenantId
  const path = (await params).path ?? []
  const shop = await previewShop(tenantId)
  if (!shop) notFound()
  const now = new Date()
  const [look, src, content] = await Promise.all([previewLook(tenantId), manifestsFor(tenantId), previewContent(tenantId)])
  const theme = themeOf(shop, look, src)
  const { circles, strip } = shellPictures(theme, shellNeedsCatalogue(theme) ? await previewCatalogue(tenantId) : null, now)
  const { body } = await previewPage({ tenantId, shop, path, href, now, theme, contact: content.contact ?? undefined })
  return <ShopShell shop={shop} href={href} theme={theme} content={shellContentOf(content, false, now)} circles={circles} strip={strip}>{body}</ShopShell>
}

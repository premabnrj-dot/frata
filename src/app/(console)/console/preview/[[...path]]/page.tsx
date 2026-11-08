import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OpeningSoon } from '@/components/storefront/pages'
import { previewPage } from '@/components/storefront/preview-body'
import { ShopShell } from '@/components/storefront/shell'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { previewCatalogue, previewLook, previewShop } from '@/lib/queries/storefront'
import { circlesOf, themeOf } from '@/lib/themes/page-look'

// The merchant's own shop, as shoppers will see it — drafts and unlisted
// pieces included, never cached, never indexed (storefront spec § Preview).
// Same views as the shop; the tenant is the member's, from requireMember.
export const metadata: Metadata = { title: 'Preview', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const BASE = '/console/preview'
const href = (p: string) => (p === '/' ? BASE : `${BASE}${p}`)

export default async function Preview({ params }: { params: Promise<{ path?: string[] }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const path = (await params).path ?? []
  const shop = await previewShop(tenantId)
  if (!shop) notFound()
  const now = new Date()
  const theme = themeOf(shop, await previewLook(tenantId))
  const circles = theme.settings.header === 'circles' ? circlesOf(await previewCatalogue(tenantId), now) : []
  const { body, note } = await previewPage({ tenantId, shop, path, href, now, theme })

  const banner = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-store-ink px-4 py-2 text-sm text-store-paper">
      <span className="font-medium">Preview</span>
      <span className="opacity-80">{shop.publishedAt ? 'Your shop is open.' : 'Shoppers see “Opening soon” until your shop opens.'} Drafts show here; shoppers never see them.</span>
      {note && <span className="w-full">{note}</span>}
      <Link href="/console/products" className="ml-auto underline">Back to products</Link>
    </div>
  )
  return (
    <div className="-m-4 sm:-m-6">
      <ShopShell shop={shop} href={href} banner={banner} theme={theme} circles={circles}>{body}</ShopShell>
      {!shop.publishedAt && <details className="mx-4 my-6 text-sm"><summary className="cursor-pointer">What shoppers see now</summary><OpeningSoon shop={shop} href={href} /></details>}
    </div>
  )
}

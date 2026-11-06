import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AllView, CollectionView, GoneView, HomeView, OpeningSoon, PolicyView, ShopNotFound } from '@/components/storefront/pages'
import { POLICY_TITLE } from '@/components/storefront/policy'
import { ProductView } from '@/components/storefront/product-view'
import { ShopShell } from '@/components/storefront/shell'
import { Panel } from '@/components/ui/panel'
import { statusLabel, visibility, type Status } from '@/domains/catalogue/availability'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { previewCatalogue, previewProduct, previewShop } from '@/lib/queries/storefront'

// The merchant's own shop, as shoppers will see it — drafts and unlisted
// pieces included, never cached, never indexed (storefront spec § Preview).
// Same views as the shop; the tenant is the member's, from requireMember.
export const metadata: Metadata = { title: 'Preview · Frata', robots: { index: false, follow: false } }
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
  let body: React.ReactNode
  let note: string | null = null
  const [a, b, ...rest] = path
  if (rest.length) body = <ShopNotFound href={href} />
  else if (!a) body = <HomeView shop={shop} cat={await previewCatalogue(tenantId)} href={href} now={now} />
  else if (a === 'products' && !b) body = <AllView cat={await previewCatalogue(tenantId)} href={href} now={now} />
  else if (a === 'products' && b && /^[a-z0-9-]{1,100}$/.test(b)) {
    const r = await previewProduct(tenantId, b)
    if (r.kind === 'moved') redirect(href(`/products/${r.to}`))
    if (r.kind === 'none') body = <ShopNotFound href={href} />
    else {
      const p = r.product
      const v = visibility(p.status as Status, p.publishAt ? new Date(p.publishAt) : null, now)
      const label = statusLabel(p.status as Status, p.publishAt ? new Date(p.publishAt) : null, now)
      if (!v.reachable) note = `${label}: shoppers ${v.gone ? 'read that it is no longer available' : 'get "page not found"'} here.`
      else if (!v.listed) note = 'Unlisted: shoppers with the link see this page; it is not in lists or search.'
      body = v.gone ? <GoneView title={p.title} cat={await previewCatalogue(tenantId)} href={href} now={now} /> : <ProductView shop={shop} p={p} now={now} />
    }
  } else if (a === 'collections' && b) {
    const cat = await previewCatalogue(tenantId)
    const c = cat.collections.find((x) => x.handle === b)
    body = c ? <CollectionView c={c} cat={cat} href={href} now={now} /> : <ShopNotFound href={href} />
  } else if (a === 'policies' && b && b in POLICY_TITLE) body = <PolicyView shop={shop} page={b as keyof typeof POLICY_TITLE} />
  else body = <ShopNotFound href={href} />

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
      <ShopShell shop={shop} href={href} banner={banner}>{body}</ShopShell>
      {!shop.publishedAt && <details className="mx-4 my-6 text-sm"><summary className="cursor-pointer">What shoppers see now</summary><OpeningSoon shop={shop} href={href} /></details>}
    </div>
  )
}

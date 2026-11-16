import Link from 'next/link'
import { Panel } from '@/components/ui/panel'
import { button } from '@/components/ui/button'
import { NowProvider } from '@/components/time/now'
import { requireCapability } from '@/lib/auth/require-capability'
import { brandPage, brandSample } from '@/lib/queries/brand'
import { shopSettingsFor } from '@/lib/queries/storefront'
import { brandSaver, decidesBrand } from '@/domains/brand/who'
import { holds } from '@/domains/tenancy/roles'
import { BrandEditor } from './_components/brand-editor'
import { BuilderBrand } from './_builder/brand'

export const metadata = { title: 'Brand' }

/**
 * Console › Brand (one-address plan P1·8; owner-approved mockup docs/mockups/2026-11-16-p1-brand.html). A code-site
 * store's logo files, colours, fonts, corners and spacing. preview.read (the store's preview) lets a partner's Builder
 * in, read-only, as frata_builder in its own file (O9); the owner, a Manager and the store's partner edit; staff and the
 * accountant are refused, as the mockup's table says; a support visit reads the same facts as a Builder. A theme shop
 * has no Brand (O19): its look is in Look. Every write asks saveBrand itself (src/lib/content/save.ts).
 */
export default async function BrandPage() {
  const cap = await requireCapability('preview.read')
  if (!cap.ok) return <Panel title={cap.message} />
  if (cap.kind === 'builder') return <BuilderBrand actor={cap.actor} shopName={cap.store.tenantName} at={new Date().toISOString()} />
  const { tenantId, role, supportSessionId } = cap.auth.membership
  if (!holds(role, 'shop.build')) return <Panel title="Only the owner, a Manager or the store’s partner opens Brand" />
  const now = new Date()
  const [page, product, shop] = await Promise.all([
    brandPage(tenantId, now),
    brandSample(tenantId, now).catch(() => null),
    shopSettingsFor(tenantId),
  ]).catch((err: unknown) => { console.error('[brand page]', err instanceof Error ? err.name : err); return [null, null, null] as const })
  if (!page || !shop) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  if (!page.brand) return <Panel title="Your store’s look is in Look" action={<Link href="/console/look" className={button({ variant: 'secondary' })}>Open Look</Link>} />
  const saver = brandSaver(role, supportSessionId, page.open)
  const mode = saver === 'live' ? 'edit' : saver === 'waits' ? 'waits' : 'preview'
  return (
    <NowProvider at={now.toISOString()}>
      <BrandEditor tenantId={tenantId} mode={mode} live={page.brand.record} version={page.version}
        waiting={page.waiting ? { id: page.waiting.id, record: page.waiting.record, proposedAt: page.waiting.proposedAt, proposer: page.proposer } : null}
        decides={decidesBrand(role, supportSessionId)}
        sample={{ shopName: shop.shopName, product, paper: page.paper }} tagline={shop.tagline} />
    </NowProvider>
  )
}

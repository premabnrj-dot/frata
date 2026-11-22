import Link from 'next/link'
import { Panel } from '@/components/ui/panel'
import { button } from '@/components/ui/button'
import { NowProvider } from '@/components/time/now'
import { PolicyBody } from '@/components/storefront/policy'
import { checkoutReturnLine } from '@/components/storefront/checkout-lines'
import { requireCapability } from '@/lib/auth/require-capability'
import { checkoutPage, checkoutSamples } from '@/lib/queries/brand'
import { shopSettingsFor } from '@/lib/queries/storefront'
import { brandSaver } from '@/domains/brand/who'
import { trustFactsOf } from '@/domains/brand/checkout'
import { orderPrefix } from '@/domains/signup/slug'
import { holds } from '@/domains/tenancy/roles'
import { formatPhone } from '@/lib/format'
import { CheckoutEditor } from '../_components/checkout-editor'
import { BrandTabs } from '../_components/brand-tabs'
import { BuilderCheckout } from '../_builder/checkout'

export const metadata = { title: 'Brand · Checkout' }

/** The sample order's arrival, from the store's own delivery days (the preview only; dates as yyyy-mm-dd). */
const arrivesFrom = (now: Date, f: { dispatchDays: number; metroDays: number; restDays: number }) => {
  if (!f.restDays) return null
  const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10)
  return { from: day(f.dispatchDays + Math.min(f.metroDays || f.restDays, f.restDays)), to: day(f.dispatchDays + f.restDays) }
}

/**
 * Console › Brand › Checkout (one-address plan P2·6; owner-approved mockup docs/mockups/2026-11-16-p2-checkout.html,
 * screens 8–10). A code-site store's checkout design: header, footer, trust blocks and two lines, with the preview on
 * the store's own products. preview.read lets a partner's Builder in, read-only, as frata_builder (O9); the owner, a
 * Manager and the store's partner edit; staff and the accountant are refused; a support visit reads the facts. A theme
 * shop has no Brand (O19). Every write asks saveCheckout itself (src/lib/content/save.ts).
 */
export default async function BrandCheckoutPage() {
  const cap = await requireCapability('preview.read')
  if (!cap.ok) return <Panel title={cap.message} />
  if (cap.kind === 'builder') return <BuilderCheckout actor={cap.actor} shopName={cap.store.tenantName} at={new Date().toISOString()} tabs={<BrandTabs at="checkout" />} />
  const { tenantId, role, supportSessionId } = cap.auth.membership
  if (!holds(role, 'shop.build')) return <Panel title="Brand opens for the owner, a Manager or the store’s partner" action={<Link href="/console" className={button({ variant: 'secondary' })}>Back to Home</Link>} />
  const now = new Date()
  const [page, items, shop] = await Promise.all([
    checkoutPage(tenantId, now),
    checkoutSamples(tenantId, now).catch(() => []),
    shopSettingsFor(tenantId),
  ]).catch((err: unknown) => { console.error('[brand checkout page]', err instanceof Error ? err.name : err); return [null, [], null] as const })
  if (!page || !shop) return <Panel title="We couldn’t load this screen" action={<Link href="/console/brand/checkout" className={button({ variant: 'secondary' })}>Try again</Link>}>Nothing was changed. Try again in a minute.</Panel>
  if (!page.brand) return <Panel title="Your store’s look is in Look" action={<Link href="/console/look" className={button({ variant: 'secondary' })}>Open Look</Link>} />
  const saver = brandSaver(role, supportSessionId, page.open)
  const mode = saver === 'live' ? 'edit' : saver === 'waits' ? 'waits' : 'preview'
  const data = {
    items: [...items], rules: { shippingFlat: shop.shippingFlat, freeShippingAbove: shop.freeShippingAbove, codOn: shop.codOn, codMax: shop.codMax },
    facts: { shopName: shop.shopName, legalName: shop.legalName, address: shop.address, supportEmail: shop.supportEmail, supportPhone: shop.supportPhone ? formatPhone(shop.supportPhone) : '',
      grievanceName: shop.grievanceName, grievanceEmail: shop.grievanceEmail, returnLine: checkoutReturnLine(shop.returnKind, shop.returnDays) },
    home: '#', orderCode: `${orderPrefix(shop.orderPrefix, shop.shopName)}-1042`, arrives: arrivesFrom(now, shop),
    policy: <PolicyBody page="returns" facts={shop} override={Object.hasOwn(shop.overrides, 'returns') ? shop.overrides.returns : null} shopper />,
  }
  return (
    <NowProvider at={now.toISOString()}>
      <CheckoutEditor mode={mode} live={page.design} version={page.version} waiting={page.waiting?.design ?? null} record={page.brand.record}
        shopName={shop.shopName} facts={trustFactsOf(shop)} data={data} tabs={<BrandTabs at="checkout" />} />
    </NowProvider>
  )
}

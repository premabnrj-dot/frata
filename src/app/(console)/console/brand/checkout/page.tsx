import Link from 'next/link'
import { Panel } from '@/components/ui/panel'
import { button } from '@/components/ui/button'
import { NowProvider } from '@/components/time/now'
import { PolicyBody } from '@/components/storefront/policy'
import { checkoutReturnLine } from '@/components/storefront/checkout-lines'
import { requireCapability } from '@/lib/auth/require-capability'
import { checkoutPage, checkoutSamples } from '@/lib/queries/brand'
import { shopSettingsFor } from '@/lib/queries/storefront'
import { brandSaver, decidesBrand } from '@/domains/brand/who'
import { deliveryWindow, trustFactsOf } from '@/domains/brand/checkout'
import { orderPrefix } from '@/domains/signup/slug'
import { holds } from '@/domains/tenancy/roles'
import { brandFactsOf } from '@/lib/storefront/brand-facts'
import { CheckoutEditor } from '../_components/checkout-editor'
import { BrandTabs } from '../_components/brand-tabs'
import { BuilderCheckout } from '../_builder/checkout'

export const metadata = { title: 'Brand · Checkout' }

/** The sample order's arrival, from the store's own delivery days (the preview only; dates as yyyy-mm-dd). */
const arrivesFrom = (now: Date, f: { dispatchDays: number; metroDays: number; restDays: number }) => {
  const w = deliveryWindow(f)
  if (!w) return null
  const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10)
  return { from: day(w.lo), to: day(w.hi) }
}

/**
 * Console › Brand › Checkout (one-address plan P2·6; owner-approved mockup docs/mockups/2026-11-16-p2-checkout.html,
 * screens 8–10). A code-site store's checkout design: header, footer, trust blocks and two lines, with the preview on
 * the store's own products. preview.read lets a partner's Builder in, read-only, as frata_builder (O9); the owner, a
 * Manager and the store's partner edit; staff read it while a partner's change waits (the review card without buttons,
 * four-screens mockup § 4), and are refused otherwise, as is the accountant; a support visit reads the facts. A theme
 * shop has no Brand (O19). Every write asks saveCheckout itself (src/lib/content/save.ts).
 */
export default async function BrandCheckoutPage() {
  const cap = await requireCapability('preview.read')
  if (!cap.ok) return <Panel title={cap.message} />
  if (cap.kind === 'builder') return <BuilderCheckout actor={cap.actor} shopName={cap.store.tenantName} at={new Date().toISOString()} tabs={<BrandTabs at="checkout" />} />
  const { tenantId, role, supportSessionId } = cap.auth.membership
  const refused = <Panel title="Brand opens for the owner, a Manager or the store’s partner" action={<Link href="/console" className={button({ variant: 'secondary' })}>Back to Home</Link>} />
  const builds = holds(role, 'shop.build')
  const now = new Date()
  const [page, items, shop] = await Promise.all([
    checkoutPage(tenantId, now),
    checkoutSamples(tenantId, now).catch(() => []),
    shopSettingsFor(tenantId),
  ]).catch((err: unknown) => { console.error('[brand checkout page]', err instanceof Error ? err.name : err); return [null, [], null] as const })
  if (!page || !shop) return <Panel title="We couldn’t load this screen" action={<Link href="/console/brand/checkout" className={button({ variant: 'secondary' })}>Try again</Link>}>Nothing was changed. Try again in a minute.</Panel>
  // Staff read the page only while a partner's change waits (four-screens § 4); refused, nothing loaded above is drawn.
  if (!builds && !page.waiting) return refused
  if (!page.brand) return <Panel title="Your store’s look is in Look" action={<Link href="/console/look" className={button({ variant: 'secondary' })}>Open Look</Link>} />
  const saver = brandSaver(role, supportSessionId, page.open)
  const mode = saver === 'live' ? 'edit' : saver === 'waits' ? 'waits' : 'preview'
  const data = {
    items: [...items], rules: { shippingFlat: shop.shippingFlat, freeShippingAbove: shop.freeShippingAbove, codOn: shop.codOn, codMin: shop.codMin, codMax: shop.codMax, codCharge: shop.codCharge },
    facts: { ...brandFactsOf(shop), returnLine: checkoutReturnLine(shop.returnKind, shop.returnDays) },
    home: '#', orderCode: `${orderPrefix(shop.orderPrefix, shop.shopName)}-1042`, arrives: arrivesFrom(now, shop),
    policy: <PolicyBody page="returns" facts={shop} override={Object.hasOwn(shop.overrides, 'returns') ? shop.overrides.returns : null} shopper />,
  }
  return (
    <NowProvider at={now.toISOString()}>
      <CheckoutEditor mode={mode} live={page.design} version={page.version} waiting={page.waiting} decides={decidesBrand(role, supportSessionId)} record={page.brand.record}
        shopName={shop.shopName} facts={trustFactsOf(shop)} data={data} tabs={<BrandTabs at="checkout" />} />
    </NowProvider>
  )
}

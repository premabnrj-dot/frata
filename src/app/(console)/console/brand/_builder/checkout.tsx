import { Panel } from '@/components/ui/panel'
import { NowProvider } from '@/components/time/now'
import type { BuilderActor } from '@/lib/db/actor'
import { builderBrandSample, builderCheckout } from '@/lib/queries/builder'
import { trustFactsOf } from '@/domains/brand/checkout'
import { CheckoutEditor } from '../_components/checkout-editor'

/**
 * Console › Brand › Checkout for a partner's Builder (O9, mockup screen 10): every value as a fact, the preview, nothing
 * that saves. Read as frata_builder: the live record and design's named columns and the store's public delivery, returns
 * and Pay on delivery facts (drizzle/0161); never a waiting change, the GSTIN or the legal details (the preview's legal
 * block is the store's name, as P1's invoice preview; its GST block isn't drawn).
 */
export async function BuilderCheckout({ actor, shopName, at, tabs }: { actor: BuilderActor; shopName: string; at: string; tabs: React.ReactNode }) {
  const [c, product] = await Promise.all([
    builderCheckout(actor).catch((err: unknown) => { console.error('[brand checkout builder]', err instanceof Error ? err.name : err); return null }),
    builderBrandSample(actor).catch(() => null),
  ])
  if (!c || !c.facts) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  // No grant on the GSTIN (drizzle/0161): the Builder's preview never draws the GST block.
  const facts = trustFactsOf({ ...c.facts, gst: { invoice: false } })
  const data = {
    items: product ? [{ title: product.title, size: '', price: product.price, photo: product.photo }] : [],
    rules: { shippingFlat: 0, freeShippingAbove: 0, codOn: c.facts.codOn, codMin: 0, codMax: c.facts.codMax, codCharge: 0 },
    facts: { shopName, legalName: '', address: '', supportEmail: '', supportPhone: '', grievanceName: '', grievanceEmail: '', returnLine: null },
    home: '#', orderCode: 'ORD-1042', arrives: null, policy: null,
  }
  return (
    <NowProvider at={at}>
      <CheckoutEditor mode="preview" live={c.design} version={null} waiting={null} decides={false} record={c.record} shopName={shopName} facts={facts} data={data} tabs={tabs} />
    </NowProvider>
  )
}

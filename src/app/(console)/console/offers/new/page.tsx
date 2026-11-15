import { errName } from '@/lib/log'
import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import Link from 'next/link'
import { OFFER_TEMPLATES, toIst, type OfferValues } from '@/domains/checkout/offer-form'
import { DISCOUNT_STYLES } from '@/domains/checkout/discounts'
import { CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { OfferEditor } from '../_components/offer-editor'
import { offerExampleFor, offerPickers } from '@/lib/queries/discounts'

export const metadata = { title: 'New offer' }

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ style?: string; from?: string }> }) {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return <Panel title={auth.message} />
  const sp = await searchParams
  const from = OFFER_TEMPLATES.find((t) => t.key === sp.from)
  const s = from?.style ?? sp.style
  const style = (DISCOUNT_STYLES as readonly string[]).includes(s ?? '') ? s! : 'order_off'
  const initial: OfferValues = {
    title: style === 'pay_online' ? 'Pay online, save' : style === 'free_shipping' ? 'Free shipping' : style === 'bxgy' ? 'Buy 2, get 1 free' : style === 'free_gift' ? 'Free gift' : '', style, kind: style === 'order_off' || style === 'product_off' ? 'percent' : 'amount',
    value: style === 'pay_online' ? '50' : '', cap: '', min: '', code: '', startsAt: toIst(new Date()), endsAt: '', limitTotal: '', limitPerPhone: '', budget: '',
    listed: true, combinesWithPayment: true, announce: false,
    targets: 'all', targetIds: [], buyQty: '2', getQty: '1', getPct: '100', giftVariantId: '', tiers: [], firstOrder: false,
    ...from?.values,
  }
  // Side by side (speed review: one after the other was the slow shape).
  const [pickers, example] = await Promise.all([offerPickers(auth.membership.tenantId),
    offerExampleFor(auth.membership.tenantId, auth.membership.role).catch((err) => { console.error('[offer example]', errName(err)); return null })])
  return (
    <div className="max-w-6xl">
      <PageHeader title="New offer" back={{ href: '/console/offers', label: 'Offers' }} />
      <nav aria-label="Start from" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Start from:</span>
        {OFFER_TEMPLATES.map((t) => <Link key={t.key} href={`/console/offers/new?from=${t.key}`} aria-current={from?.key === t.key ? 'true' : undefined}
          className="inline-flex min-h-9 items-center rounded-md border border-input px-3 hover:bg-accent aria-[current]:border-foreground">{t.name}</Link>)}
      </nav>
      <OfferEditor key={from?.key ?? style} id={null} initial={initial} locked={{ style: false, code: false }} pickers={pickers}
        example={example} />
    </div>
  )
}

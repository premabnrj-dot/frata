import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import Link from 'next/link'
import { OFFER_TEMPLATES, toIst, type OfferValues } from '@/domains/checkout/offer-form'
import { DISCOUNT_STYLES } from '@/domains/checkout/discounts'
import { CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { OfferEditor } from '../_components/offer-editor'
import { offerPickers } from '@/lib/queries/discounts'

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
  const pickers = await offerPickers(auth.membership.tenantId)
  return (
    <div className="max-w-3xl">
      <PageHeader title="New offer" back={{ href: '/console/offers', label: 'Offers' }} />
      <p className="mb-4 text-sm text-muted-foreground">Saved as a draft. {(CAN_MANAGE as readonly string[]).includes(auth.membership.role) ? 'Start it when you are ready.' : 'The shop’s owner starts it.'}</p>
      <nav aria-label="Start from" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Start from:</span>
        {OFFER_TEMPLATES.map((t) => <Link key={t.key} href={`/console/offers/new?from=${t.key}`} aria-current={from?.key === t.key ? 'true' : undefined}
          className="inline-flex min-h-9 items-center rounded-md border border-input px-3 hover:bg-accent aria-[current]:border-foreground">{t.name}</Link>)}
      </nav>
      <OfferEditor key={from?.key ?? style} id={null} initial={initial} locked={{ style: false, code: false }} pickers={pickers} />
    </div>
  )
}

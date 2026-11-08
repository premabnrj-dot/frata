import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { toIst, type OfferValues } from '@/domains/checkout/offer-form'
import { DISCOUNT_STYLES } from '@/domains/checkout/discounts'
import { CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { OfferEditor } from '../_components/offer-editor'

export const metadata = { title: 'New offer' }

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ style?: string }> }) {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return <Panel title={auth.message} />
  const s = (await searchParams).style
  const style = (DISCOUNT_STYLES as readonly string[]).includes(s ?? '') ? s! : 'order_off'
  const initial: OfferValues = {
    title: style === 'pay_online' ? 'Pay online, save' : style === 'free_shipping' ? 'Free shipping' : '', style, kind: style === 'order_off' ? 'percent' : 'amount',
    value: style === 'pay_online' ? '50' : '', cap: '', min: '', code: '', startsAt: toIst(new Date()), endsAt: '', limitTotal: '', limitPerPhone: '', budget: '',
    listed: true, combinesWithPayment: true, announce: false,
  }
  return (
    <div className="max-w-3xl">
      <PageHeader title="New offer" back={{ href: '/console/offers', label: 'Offers' }} />
      <p className="mb-4 text-sm text-muted-foreground">Saved as a draft. {(CAN_MANAGE as readonly string[]).includes(auth.membership.role) ? 'Start it when you are ready.' : 'The shop’s owner starts it.'}</p>
      <OfferEditor id={null} initial={initial} locked={{ style: false, code: false }} />
    </div>
  )
}

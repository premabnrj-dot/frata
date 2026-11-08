import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { ANY_MEMBER, CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { listOffers } from '@/lib/queries/discounts'
import { dayMonthIN } from '@/lib/format-date'
import { OfferEditor } from '../_components/offer-editor'
import { OfferSteps } from '../_components/offer-steps'
import { STATUS, terms, valuesOf } from '../_components/data'

export const metadata = { title: 'Offer' }

export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const rows = await listOffers(auth.membership.tenantId).catch(() => null)
  if (!rows) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const o = rows.find((r) => r.id === id)
  if (!o) notFound()
  const role = auth.membership.role as string
  const manager = (CAN_MANAGE as readonly string[]).includes(role)
  const canEdit = o.status !== 'ended' && ((CAN_BUILD as readonly string[]).includes(role) && (o.status === 'draft' || manager))
  const st = STATUS[o.status]
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={o.title} back={{ href: '/console/offers', label: 'Offers' }} badges={<Badge tone={st.tone}>{st.label}</Badge>} actions={manager ? <OfferSteps id={o.id} status={o.status} title={o.title} /> : undefined} />
      <p className="text-sm text-muted-foreground">{terms(o)}{o.code ? ` · code ${o.code}` : ' · applies by itself'}{o.endsAt ? ` · ends ${dayMonthIN(o.endsAt)}` : ''}</p>
      {o.status === 'draft' && !manager ? <p className="rounded-md bg-info px-3 py-2 text-sm text-info-text">A draft. The shop’s owner or an admin starts it.</p> : null}
      <Section title="So far">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><dt className="text-xs text-muted-foreground">Uses</dt><dd className="font-mono text-lg"><Numeric>{o.useCount}</Numeric>{o.limitTotal ? <span className="text-sm text-muted-foreground"> / {o.limitTotal}</span> : null}</dd></div>
          <div><dt className="text-xs text-muted-foreground">₹ given</dt><dd className="font-mono text-lg"><Money paise={paise(o.given)} /></dd>{o.budgetLeft !== null ? <dd className="text-xs text-muted-foreground"><Money paise={paise(o.budgetLeft)} /> of the budget left</dd> : null}</div>
          <div><dt className="text-xs text-muted-foreground">Delivered</dt><dd className="font-mono text-lg"><Numeric>{o.delivered}</Numeric></dd></div>
          <div><dt className="text-xs text-muted-foreground">₹ kept per delivered order</dt><dd className="font-mono text-lg">{o.keptPerDelivered === null ? '—' : <Money paise={paise(o.keptPerDelivered)} />}</dd>
            {o.keptPerDelivered === null ? <dd className="text-xs text-muted-foreground">Once orders are delivered and their costs are known.</dd> : null}</div>
        </dl>
      </Section>
      {canEdit ? <OfferEditor id={o.id} initial={valuesOf(o)} locked={{ style: true, code: true }} />
        : <Panel title={o.status === 'ended' ? 'This offer has ended' : 'Only an owner or admin can change a started offer'}>{o.status === 'ended' ? 'It no longer changes. Make a new offer to run it again.' : 'You can see its numbers here.'}</Panel>}
    </div>
  )
}

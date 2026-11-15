import { Fragment } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Panel } from '@/components/ui/panel'
import { PARTNER_SERVICES, PARTNER_TERMS } from '@/domains/partners/terms'
import { partnerCan } from '@/domains/partners/team'
import { requirePartner } from '@/lib/auth/require-partner'
import { formatPhone } from '@/lib/format'
import { dayIN } from '@/lib/format-date'
import { frataWhatsappLink } from '@/lib/site'

export const metadata = { title: 'Your details' }

/** What Frrata holds about the partner. Changes after approval go through Frrata (WhatsApp), so they are on record. */
export default async function PartnerDetailsPage() {
  const auth = await requirePartner()
  if (!auth.ok) return <Panel title={auth.message} />
  const p = auth.partner
  if (!partnerCan(p.memberRole, 'seeDetails')) return <Panel title="Only the partner’s owner sees these details" />
  const services = p.services.map((s) => PARTNER_SERVICES.find(([k]) => k === s)?.[1] ?? s).join(', ')
  const rows: [string, React.ReactNode][] = [
    ['Name', p.name], ['Studio', p.businessName || '—'], ['Email', <span key="e" className="font-num">{p.email}</span>],
    ['WhatsApp', <span key="w" className="font-num">{formatPhone(p.phone)}</span>], ['City', p.city], ['Does', services || '—'],
    ['Work', p.workUrl || '—'], ['Approved', p.approvedAt ? dayIN(p.approvedAt) : '—'],
    ['Terms', `${PARTNER_TERMS.shareBps / 100}% for ${PARTNER_TERMS.shareMonths} months · version ${PARTNER_TERMS.version}`],
  ]
  return (
    <>
      <PageHeader title="Your details" />
      <Section className="max-w-2xl" ariaLabel="Your details">
      <dl className="grid max-w-2xl grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd></Fragment>)}
      </dl>
      </Section>
      <p className="text-sm text-muted-foreground">To change these, <a href={frataWhatsappLink()} target="_blank" rel="noopener" className="underline">message us on WhatsApp</a>.</p>
    </>
  )
}

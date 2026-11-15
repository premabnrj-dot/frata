import { notFound } from 'next/navigation'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { shopOffersForAdmin } from '@/lib/admin/offers'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayMonthIN } from '@/lib/format-date'
import { STYLE_LABEL } from '@/domains/checkout/offer-form'
import type { DiscountStyle } from '@/domains/checkout/discounts'
import { STATUS_WORDS } from '@/domains/checkout/offer-status'
import { resumeAction, stopAction } from '../actions'
import { Submit } from '@/components/ui/submit'
import { MoreDialogs } from '../../_components/form-dialog'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'

export const metadata = { title: 'Store offers' }

const input = FIELD

/**
 * One shop's offers for Frrata staff (offers O·4): what each is and where it stands, never its terms or uses. Admin
 * stops one with a reason the shop reads, or resumes one Frrata stopped. Guardrails are the engine's; nothing loosens them.
 */
export default async function ShopOffersPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [{ tenantId }, adminRole] = await Promise.all([params, requireStaff(ADMIN_ONLY)])
  if (!z.uuid().safeParse(tenantId).success) notFound()
  const shop = await shopOffersForAdmin(staff, tenantId, new Date())
  if (!shop) notFound()
  const admin = adminRole.ok
  const open = shop.offers.filter((o) => o.status !== 'ended')
  const ended = shop.offers.length - open.length
  return (
    <>
      <PageHeader title={`${shop.name} · offers`} back={{ href: '/admin/offers', label: 'Offers' }} meta={`${open.length} not ended${ended ? `, ${ended} ended` : ''}`} />
      {!open.length ? <Panel title="Nothing to stop" /> : (
        <div className="space-y-3">
          {open.map((o) => {
            const hidden = <><input type="hidden" name="tenantId" value={tenantId} /><input type="hidden" name="id" value={o.id} /></>
            return (
              <Section key={o.id} title={o.title} id={`o-${o.id}`} action={<span className="flex items-center gap-2"><Badge tone={STATUS_WORDS[o.status].tone}>{STATUS_WORDS[o.status].label}</Badge>
                {admin && o.status !== 'stopped' && <MoreDialogs label={`More for ${o.title}`} specs={[{ label: 'Stop…', title: `Stop ${o.title}?`, description: 'Shoppers lose it at once. The store reads your reason and can only end it.', action: stopAction, keep: 'Keep it running', go: `Stop ${o.title}`, danger: true,
                  fields: <>{hidden}<label className="flex flex-col gap-1 text-sm"><span className="font-medium">Why stop it <span className="font-normal text-muted-foreground">(the store reads this)</span></span>
                    <input name="reason" required minLength={3} maxLength={300} placeholder="The struck price was never charged" data-error="Say why, in a few words." className={input} /><FieldMessage name="reason" /></label></> }]} />}</span>}>
                <p className="text-sm text-muted-foreground">{STYLE_LABEL[o.style as DiscountStyle]?.name ?? o.style} · from {dayMonthIN(o.startsAt)}{o.endsAt ? ` till ${dayMonthIN(o.endsAt)}` : ''}</p>
                {o.status === 'stopped' ? <p className="text-sm">Stopped{o.stoppedAt ? ` ${dayMonthIN(o.stoppedAt)}` : ''}: {o.stopReason}</p> : null}
                {admin && o.status === 'stopped' ? <ActionForm action={resumeAction}>{hidden}<Submit variant="secondary">Resume {o.title}</Submit></ActionForm> : null}
              </Section>
            )
          })}
        </div>
      )}
    </>
  )
}

import { notFound } from 'next/navigation'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { shopOffersForAdmin } from '@/lib/admin/offers'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayMonthIN } from '@/lib/format-date'
import { STYLE_LABEL } from '@/domains/checkout/offer-form'
import type { DiscountStyle } from '@/domains/checkout/discounts'
import { STATUS_WORDS } from '@/domains/checkout/offer-status'
import { resumeAction, stopAction } from '../actions'
import { Submit } from '@/components/ui/submit'

export const metadata = { title: 'Shop offers' }

const input = 'h-10 rounded-md border border-input bg-card px-3 text-sm'

/**
 * One shop's offers for Frrata staff (offers O·4): what each is and where it stands, never its terms or uses. Admin
 * stops one with a reason the shop reads, or resumes one Frrata stopped. Guardrails are the engine's; nothing loosens them.
 */
export default async function ShopOffersPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [{ tenantId }, sp, adminRole] = await Promise.all([params, searchParams, requireStaff(ADMIN_ONLY)])
  if (!z.uuid().safeParse(tenantId).success) notFound()
  const shop = await shopOffersForAdmin(staff, tenantId, new Date())
  if (!shop) notFound()
  const admin = adminRole.ok
  const open = shop.offers.filter((o) => o.status !== 'ended')
  const ended = shop.offers.length - open.length
  return (
    <>
      <PageHeader title={`${shop.name} · offers`} back={{ href: '/admin/offers', label: 'Offers' }} meta={`${open.length} not ended${ended ? `, ${ended} ended` : ''}. Stopping one takes it away from shoppers at once; the shop sees your reason and can only end it.`} />
      <Notice ok={sp.ok} error={sp.error} />
      {!open.length ? <Panel title="Nothing to stop">This shop has no offer that has not ended.</Panel> : (
        <div className="space-y-3">
          {open.map((o) => {
            const hidden = <><input type="hidden" name="tenantId" value={tenantId} /><input type="hidden" name="id" value={o.id} /></>
            return (
              <Section key={o.id} title={o.title} id={`o-${o.id}`} action={<Badge tone={STATUS_WORDS[o.status].tone}>{STATUS_WORDS[o.status].label}</Badge>}>
                <p className="text-sm text-muted-foreground">{STYLE_LABEL[o.style as DiscountStyle]?.name ?? o.style} · from {dayMonthIN(o.startsAt)}{o.endsAt ? ` till ${dayMonthIN(o.endsAt)}` : ''}</p>
                {o.status === 'stopped' ? <p className="text-sm">Stopped{o.stoppedAt ? ` ${dayMonthIN(o.stoppedAt)}` : ''}: {o.stopReason}</p> : null}
                {admin && o.status === 'stopped' ? <form action={resumeAction}>{hidden}<Submit variant="secondary">Resume {o.title}</Submit></form> : null}
                {admin && o.status !== 'stopped' ? (
                  <form action={stopAction} className="space-y-2">{hidden}
                    <label className="block text-sm font-medium" htmlFor={`why-${o.id}`}>Why stop it <span className="font-normal text-muted-foreground">(the shop reads this)</span></label>
                    <input id={`why-${o.id}`} name="reason" required minLength={3} maxLength={300} placeholder="e.g. The struck price was never charged" className={`${input} w-full max-w-md`} />
                    <div><Submit variant="destructive">Stop {o.title}</Submit></div>
                  </form>
                ) : null}
              </Section>
            )
          })}
        </div>
      )}
    </>
  )
}

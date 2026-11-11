import { lastDay } from '@/domains/plans/trial'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { usage, type Feature } from '@/domains/plans/entitlements'
import { FEATURE_NAMES } from '@/domains/plans/labels'
import { SUPPORT_REASON_LABEL, type SupportReason } from '@/domains/support/session'
import { getMerchant, merchantName } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dateTimeIN, dayIN, sinceIN } from '@/lib/format-date'
import { formatPercent } from '@/lib/format'
import { resendOwnerLinkAction } from './actions'
import { Section } from '@/components/layout/section'
import { MerchantTabs } from './tabs'
import { Submit } from '@/components/ui/submit'

/** The tab names the merchant ("Kesar Studio · Frrata Admin"). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  const { id } = await params
  if (!staff.ok || !/^[0-9a-f-]{36}$/.test(id)) return { title: 'Merchant' }
  return { title: (await merchantName(staff, id).catch(() => null)) ?? 'Merchant' }
}

export default async function MerchantPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  const sp = await searchParams
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const now = new Date()
  const m = await getMerchant(staff, id, now)
  if (!m) notFound()
  const cur = m.current
  const use = cur ? usage(m.ordersThisMonth ?? 0, cur.v.includedOrders) : null
  const owner = m.members.find((x) => x.role === 'owner')
  const openInvite = m.invites.find((i) => i.role === 'owner' && !i.acceptedAt && !i.revokedAt)

  return (
    <>
      <PageHeader title={m.tenant.name} back={{ href: '/admin/merchants', label: 'Merchants' }}
        badges={<>{cur ? <Badge tone="info">{cur.name}</Badge> : <Badge tone="danger">No plan</Badge>}{m.tenant.isInternal && <Badge>Internal</Badge>}{!owner && <Badge tone="warn">Owner not signed in yet</Badge>}</>}
        meta={<><span className="font-mono">{m.host}</span> · added {dayIN(m.tenant.createdAt)} · {m.ordersThisMonth === null ? 'not drafted yet this month' : <><Numeric>{m.ordersThisMonth.toLocaleString('en-IN')}</Numeric> delivered orders this month{m.countedAt ? ` (counted ${dateTimeIN(m.countedAt)})` : ''}</>}</>}
        actions={<>
          <Link href={`/admin/merchants/${id}/plan`} className={button({ variant: 'secondary' })}>Change plan</Link>
          {/* Names the merchant (§ Frrata Admin); a long name wraps inside the button instead of overflowing it. */}
          <Link href={`/admin/merchants/${id}/support`} className={button({ size: 'wrap' })}>Open {m.tenant.name}&apos;s console</Link>
        </>} />
      <MerchantTabs id={id} on="overview" />
      <Notice ok={sp.ok} error={sp.error} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <Section title="Team">
            {m.members.length === 0 && <p className="text-sm text-muted-foreground">No one has signed in yet.</p>}
            {m.members.map((x) => (
              <div key={x.userId} className="flex items-center justify-between text-sm">
                <span className="min-w-0 [overflow-wrap:anywhere]">{x.email ?? 'Unknown'} {x.lastSignInAt && <span className="text-muted-foreground">· signed in {sinceIN(x.lastSignInAt, new Date())}</span>}</span>
                <Badge>{x.role[0]!.toUpperCase() + x.role.slice(1)}</Badge>
              </div>
            ))}
            {openInvite && (
              <form action={resendOwnerLinkAction} className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span>Invited: <span className="font-mono">{openInvite.email}</span> <span className="text-muted-foreground">· until {dayIN(openInvite.expiresAt)}</span></span>
                <input type="hidden" name="tenantId" value={id} />
                <Submit variant="secondary">Resend sign-in link</Submit>
              </form>
            )}
          </Section>

          <Section title="Support visits">
            <p className="text-sm text-muted-foreground">{m.tenant.name} sees the same list in their console&apos;s Activity.</p>
            {m.sessions.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
              <div className="divide-y divide-border text-sm">
                {m.sessions.map((s) => (
                  <div key={s.id} className="grid grid-cols-1 gap-x-2 gap-y-0.5 py-2 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]">
                    <span className="text-muted-foreground">{dateTimeIN(s.startedAt)}</span>
                    <span>{s.staffEmail}</span>
                    <span>{SUPPORT_REASON_LABEL[s.reason as SupportReason]}{s.note ? ` · ${s.note}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="w-full space-y-4 lg:w-80">
          <Section title="Plan and usage" className="text-sm">
            {cur ? (
              <>
                <div className="flex justify-between"><span>{cur.name} <span className="text-xs text-muted-foreground">· version {cur.v.version}</span></span><Money paise={paise(cur.tp.customMonthlyPrice ?? cur.v.monthlyPrice)} />/mo</div>
                {cur.tp.customMonthlyPrice !== null && <p className="text-xs text-muted-foreground">Custom price: {cur.tp.reason}</p>}
                <div className="flex justify-between"><span>Fee per delivered order</span><Numeric>{formatPercent(cur.v.feeBps / 10_000, cur.v.feeBps % 100 === 0 ? 0 : 1)}</Numeric></div>
                {/* Usage as a meter, the words beside it (visual changes, owner-approved 2026-11-08). */}
                <div>
                  <div className="flex justify-between"><span>Delivered orders this month</span><Numeric>{use!.used} / {use!.included.toLocaleString('en-IN')}</Numeric></div>
                  <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className={`block h-full origin-left rounded-full ${use!.over ? 'bg-warn-mark' : 'bg-foreground'}`} style={{ transform: `scaleX(${use!.included ? Math.min(1, use!.used / use!.included) : 1})` }} />
                  </div>
                  {use!.over && <p className="mt-1 text-warn-text">{(use!.used - use!.included).toLocaleString('en-IN')} over the plan. It keeps selling.</p>}
                </div>
                <p className="text-muted-foreground">{cur.v.features.length ? `Includes ${cur.v.features.map((f) => FEATURE_NAMES[f as Feature] ?? f).join(', ')}, all channels.` : 'All channels.'}</p>
                {cur.tp.trialEndsAt && cur.tp.trialEndsAt > now && <p className="text-warn-text">Trial until {dayIN(lastDay(cur.tp.trialEndsAt))}.</p>}
                <p className="text-muted-foreground">On this plan since {dayIN(cur.tp.startsAt)}. Billed monthly (Admin › Billing).</p>
                {(() => { const next = m.history.filter((h) => h.tp.startsAt > now).at(-1); return next ? <p className="text-warn-text">Moves to {next.name} on {dayIN(next.tp.startsAt)}{next.tp.byShop ? ', the shop’s own change' : ''}. A change here replaces it.</p> : null })()}
              </>
            ) : <p className="text-danger-text">No plan. Choose one with Change plan.</p>}
          </Section>
        </aside>
      </div>
    </>
  )
}

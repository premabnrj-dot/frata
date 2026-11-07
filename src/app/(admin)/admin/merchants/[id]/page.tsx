import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
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

/** The tab names the merchant ("Kesar Studio · Frata Admin"). */
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
  const use = cur ? usage(m.ordersThisMonth, cur.v.includedOrders) : null
  const owner = m.members.find((x) => x.role === 'owner')
  const openInvite = m.invites.find((i) => i.role === 'owner' && !i.acceptedAt && !i.revokedAt)

  return (
    <>
      <div className="space-y-1">
        <Link href="/admin/merchants" className="text-sm text-muted-foreground hover:underline">Merchants</Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{m.tenant.name}</h1>
            {cur ? <Badge tone="info">{cur.name}</Badge> : <Badge tone="danger">No plan</Badge>}
            {m.tenant.isInternal && <Badge>Internal</Badge>}
            {!owner && <Badge tone="warn">Owner not signed in yet</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/merchants/${id}/plan`} className={button({ variant: 'secondary' })}>Change plan</Link>
            <Link href={`/admin/merchants/${id}/support`} className={button()}>Open {m.tenant.name}&apos;s console</Link>
          </div>
        </div>
      </div>
      <Notice ok={sp.ok} error={sp.error} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <section className="space-y-3 rounded-md border border-border bg-card p-5">
            <h2 className="text-[15px] font-semibold">Team</h2>
            {m.members.length === 0 && <p className="text-sm text-muted-foreground">No one has signed in yet.</p>}
            {m.members.map((x) => (
              <div key={x.userId} className="flex items-center justify-between text-sm">
                <span>{x.email ?? 'Unknown'} {x.lastSignInAt && <span className="text-muted-foreground">· signed in {sinceIN(x.lastSignInAt)}</span>}</span>
                <Badge>{x.role[0]!.toUpperCase() + x.role.slice(1)}</Badge>
              </div>
            ))}
            {openInvite && (
              <form action={resendOwnerLinkAction} className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span>Invited: <span className="font-mono">{openInvite.email}</span> <span className="text-muted-foreground">· until {dayIN(openInvite.expiresAt)}</span></span>
                <input type="hidden" name="tenantId" value={id} />
                <Button type="submit" variant="secondary">Resend sign-in link</Button>
              </form>
            )}
          </section>

          <section className="space-y-3 rounded-md border border-border bg-card p-5">
            <h2 className="text-[15px] font-semibold">Support visits</h2>
            <p className="text-sm text-muted-foreground">{m.tenant.name} sees the same list in their console&apos;s Activity.</p>
            {m.sessions.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
              <div className="divide-y divide-border text-sm">
                {m.sessions.map((s) => (
                  <div key={s.id} className="grid grid-cols-[150px_1fr_1fr] gap-2 py-2">
                    <span className="text-muted-foreground">{dateTimeIN(s.startedAt)}</span>
                    <span>{s.staffEmail}</span>
                    <span>{SUPPORT_REASON_LABEL[s.reason as SupportReason]}{s.note ? ` · ${s.note}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="w-full space-y-4 lg:w-80">
          <section className="space-y-2 rounded-md border border-border bg-card p-5 text-sm">
            <h2 className="text-[15px] font-semibold">Plan and usage</h2>
            {cur ? (
              <>
                <div className="flex justify-between"><span>{cur.name} <span className="text-xs text-muted-foreground">· version {cur.v.version}</span></span><Money paise={paise(cur.tp.customMonthlyPrice ?? cur.v.monthlyPrice)} />/mo</div>
                {cur.tp.customMonthlyPrice !== null && <p className="text-xs text-muted-foreground">Custom price: {cur.tp.reason}</p>}
                <div className="flex justify-between"><span>Fee per delivered order</span><Numeric>{formatPercent(cur.v.feeBps / 10_000, cur.v.feeBps % 100 === 0 ? 0 : 1)}</Numeric></div>
                <div className="flex justify-between"><span>Orders this month</span><Numeric>{use!.used} of {use!.included.toLocaleString('en-IN')}</Numeric></div>
                {use!.over && <p className="text-warn-text">Over the included orders. It keeps selling; the next plan adds room and features.</p>}
                <p className="text-muted-foreground">{cur.v.features.length ? `Includes ${cur.v.features.map((f) => FEATURE_NAMES[f as Feature] ?? f).join(', ')}, all channels.` : 'All channels.'}</p>
                {cur.tp.trialEndsAt && cur.tp.trialEndsAt > now && <p className="text-warn-text">Trial until {dayIN(cur.tp.trialEndsAt)}.</p>}
                <p className="text-muted-foreground">On this plan since {dayIN(cur.tp.startsAt)}. Not charged yet: billing comes in Phase 6.</p>
              </>
            ) : <p className="text-danger-text">No plan. Choose one with Change plan.</p>}
          </section>
          <section className="space-y-1 rounded-md border border-border bg-card p-5 text-sm">
            <h2 className="text-[15px] font-semibold">Facts</h2>
            {m.host && <p>Shop · <span className="font-mono">{m.host}</span></p>}
            <p>Added · {dayIN(m.tenant.createdAt)}</p>
          </section>
        </aside>
      </div>
    </>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { Submit } from '@/components/ui/submit'
import { FIELD } from '@/components/ui/field'
import { paise } from '@/domains/money/paise'
import { usage } from '@/domains/plans/entitlements'
import { SUPPORT_REASON_LABEL, type SupportReason } from '@/domains/support/session'
import { getMerchant, merchantName } from '@/lib/admin/merchants'
import { merchantAddresses } from '@/lib/admin/addresses'
import { shopTrialsFor } from '@/lib/admin/trials'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayMonthIN, sinceIN } from '@/lib/format-date'
import { formatPercent } from '@/lib/format'
import { NeedsBand } from '../../_components/needs-band'
import { MoreDialogs, type DialogSpec } from '../../_components/form-dialog'
import { resendOwnerLinkAction } from './actions'
import { adminRenameAction, freezeAddressAction } from './addresses/actions'
import { endShopTrialAction } from './plan/actions'
import { MerchantTabs } from './tabs'

/** The tab names the merchant ("Kesar Studio · Frrata Admin"). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  const { id } = await params
  if (!staff.ok || !/^[0-9a-f-]{36}$/.test(id)) return { title: 'Merchant' }
  return { title: (await merchantName(staff, id).catch(() => null)) ?? 'Merchant' }
}

const ROLE = (r: string) => r[0]!.toUpperCase() + r.slice(1)
const Why = ({ label = 'Why' }: { label?: string }) => (
  <label className="flex flex-col gap-1 text-sm"><span className="font-medium">{label}</span>
    <input name="reason" required minLength={3} maxLength={500} data-error="Say why, in a few words." className={FIELD} /><FieldMessage name="reason" /></label>
)

/** Admin › a merchant (Neel N4, board Merchant): the waiting task leads, tabs for the rest, rare actions in More. */
export default async function MerchantPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const now = new Date()
  const [m, admin, addr, trials] = await Promise.all([getMerchant(staff, id, now), requireStaff(ADMIN_ONLY), merchantAddresses(staff, id), shopTrialsFor(staff, [id], now)])
  if (!m) notFound()
  const cur = m.current
  const use = cur ? usage(m.ordersThisMonth ?? 0, cur.v.includedOrders) : null
  const openInvite = m.invites.find((i) => i.role === 'owner' && !i.acceptedAt && !i.revokedAt)
  const owner = m.members.find((x) => x.role === 'owner')
  const trial = trials.get(id)
  const trialOpen = trial && !trial.facts.endedAt && trial.state !== 'paid'
  const name = m.tenant.name
  const tenant = <input type="hidden" name="tenantId" value={id} />
  const frozen = !!addr?.frozenAt

  // More: rare and final, Master admin only (the actions check again).
  const more: DialogSpec[] = admin.ok ? [
    { label: 'Rename address…', title: `Rename ${name}'s address?`, description: <>Now <span className="font-mono">{m.host}</span>. The old address forwards to the new one.</>, action: adminRenameAction, keep: 'Keep address', go: 'Rename address',
      fields: <>{tenant}<label className="flex flex-col gap-1 text-sm"><span className="font-medium">New address</span>
        <input name="slug" required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" autoComplete="off" data-error="Use 3–30 letters, digits and single hyphens." className={FIELD} /><FieldMessage name="slug" /></label><Why /></> },
    frozen
      ? { label: 'Allow address changes…', title: `Allow ${name} to change its address?`, action: freezeAddressAction, keep: 'Keep frozen', go: 'Allow changes', fields: <>{tenant}<input type="hidden" name="frozen" value="no" /><Why /></> }
      : { label: 'Freeze address changes…', title: `Freeze ${name}'s address?`, description: `${name} can't rename its address until it's allowed again.`, action: freezeAddressAction, keep: 'Keep changes open', go: 'Freeze address', fields: <>{tenant}<input type="hidden" name="frozen" value="yes" /><Why /></> },
    ...(trialOpen ? [{ label: 'End trial…', title: `End ${name}'s trial?`, description: 'The plan’s monthly price starts today. The store keeps selling.', action: endShopTrialAction, keep: 'Keep trial', go: 'End trial', danger: true, fields: <>{tenant}<Why label="Reason the store reads" /></> }] : []),
  ] : []

  return (
    <>
      <PageHeader title={name} back={{ href: '/admin/merchants', label: 'Merchants' }}
        badges={<>{cur ? <Badge>{cur.name}</Badge> : <Badge tone="danger">No plan</Badge>}
          {trialOpen && <Badge tone="info">Trial · {trial.daysLeft} {trial.daysLeft === 1 ? 'day' : 'days'} left</Badge>}
          {m.tenant.isInternal && <Badge>Internal</Badge>}</>}
        meta={<><span className="font-mono">{m.host}</span> · added {dayMonthIN(m.tenant.createdAt)}</>}
        actions={<>
          <MoreDialogs specs={more} />
          <Link href={`/admin/merchants/${id}/support`} className={button()}>Open console</Link>
        </>} />

      {openInvite && !owner && (
        <NeedsBand title="The owner hasn't signed in."
          line={<>Sign-in link sent to <span className="font-num">{openInvite.email}</span> {sinceIN(openInvite.createdAt, now)}.</>}
          action={<ActionForm action={resendOwnerLinkAction}>{tenant}<Submit variant="secondary">Resend sign-in link</Submit></ActionForm>} />
      )}

      <MerchantTabs id={id} on="overview" />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <Section title="Team" className="min-w-0 flex-1 text-sm">
          {m.members.length === 0 && !openInvite && <p className="text-muted-foreground">No one yet.</p>}
          <div className="divide-y divide-line-soft">
            {m.members.map((x) => (
              <div key={x.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 [overflow-wrap:anywhere]">{x.email ?? 'Unknown'}</span>
                <span className="flex items-center gap-2"><Badge>{ROLE(x.role)}</Badge><span className="text-muted-foreground">{x.lastSignInAt ? sinceIN(x.lastSignInAt, now) : 'Never signed in'}</span></span>
              </div>
            ))}
            {openInvite && !owner && (
              <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 font-num [overflow-wrap:anywhere]">{openInvite.email}</span>
                <span className="flex items-center gap-2"><Badge>Owner</Badge><span className="text-muted-foreground">Never signed in</span></span>
              </div>
            )}
          </div>
          <h2 className="mt-5 text-base font-semibold">Support visits</h2>
          {m.sessions.length === 0 ? <p className="text-muted-foreground">None yet.</p> : (
            <div className="divide-y divide-line-soft">
              {m.sessions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{s.staffEmail} · {SUPPORT_REASON_LABEL[s.reason as SupportReason]}{s.note ? ` · ${s.note}` : ''}</span>
                  <span className="text-muted-foreground">{dayMonthIN(s.startedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Plan" className="w-full text-sm lg:w-80" ariaLabel="Plan">
          {cur && use ? (
            <dl className="divide-y divide-line-soft">
              <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">{cur.name}</dt>
                <dd className="text-right"><Money paise={paise(cur.tp.customMonthlyPrice ?? cur.v.monthlyPrice)} /> a month · <Numeric>{cur.v.includedOrders.toLocaleString('en-IN')}</Numeric> orders · <Numeric>{formatPercent(cur.v.feeBps / 10_000, cur.v.feeBps % 100 === 0 ? 0 : 1)}</Numeric> of each delivered order</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Delivered</dt>
                <dd className={use.over ? 'text-warn-text' : undefined}><Numeric>{use.used.toLocaleString('en-IN')}</Numeric> of <Numeric>{use.included.toLocaleString('en-IN')}</Numeric></dd></div>
              {trialOpen && <div className="flex justify-between gap-3 py-2"><dt className="text-muted-foreground">Trial ends</dt><dd>{dayMonthIN(trial.lastDay)}</dd></div>}
            </dl>
          // feedback-ok: the store's state (no plan), not a button's result
          ) : <p className="text-danger-text">No plan.</p>}
          <Link href={`/admin/merchants/${id}/plan`} className="mt-2 inline-flex min-h-6 items-center text-link underline-offset-2 hover:underline">Change plan</Link>
        </Section>
      </div>
    </>
  )
}

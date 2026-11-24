import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { Submit } from '@/components/ui/submit'
import { FIELD } from '@/components/ui/field'
import { BRANDS_NOW, PARTNER_SERVICES } from '@/domains/partners/terms'
import { listPartners, partnerCounts, partnerTeamForAdmin, type AdminPartner } from '@/lib/admin/partners'
import { ownerPasskeys } from '@/lib/admin/partner-passkeys'
import { todayItems } from '@/lib/admin/today'
import { isMasterAdmin } from '@/domains/tenancy/staff-words'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { passkeys, staffProof } from '@/lib/auth/session'
import { formatPhone } from '@/lib/format'
import { dateTimeIN, dayMonthIN, sinceIN } from '@/lib/format-date'
import { DialogButton, MoreDialogs, type DialogSpec } from '../_components/form-dialog'
import { NeedsBand } from '../_components/needs-band'
import { decidePartnerAction, reinstatePartnerAction, suspendPartnerAction } from './actions'
import { OwnerPasskeysPanel } from './owner-passkeys'

export const metadata = { title: 'Partners' }

type View = 'needs' | 'approved' | 'declined'
const VIEWS: [View, string][] = [['needs', 'Needs you'], ['approved', 'Approved'], ['declined', 'Declined']]
const TABS = [['overview', 'Overview'], ['team', 'Team'], ['passkeys', 'Passkeys']] as const
type Tab = (typeof TABS)[number][0]
const nameOf = (p: AdminPartner) => p.businessName || p.name

/** Admin › Partners (Neel N4, board Partners; the partner pass kept): what needs you first, one partner beside the list. */
export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ view?: string; id?: string; tab?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const now = new Date()
  // `review` (the old view name) still lands on Needs you.
  const view: View = sp.view === 'approved' || sp.view === 'declined' ? sp.view : 'needs'
  const [counts, review, approved, declined, { items }, pk] = await Promise.all([
    partnerCounts(staff), listPartners(staff, 'review'),
    view === 'declined' ? Promise.resolve([]) : listPartners(staff, 'approved'),
    view === 'declined' ? listPartners(staff, 'declined') : Promise.resolve([]),
    todayItems(staff), passkeys(),
  ])
  // A partner owner's passkey request waits on a master admin: the same item Today shows (by partner id).
  const asking = new Set(items.filter((i) => i.kind === 'partner_passkey').map((i) => i.key))
  const needs = [...review, ...approved.filter((p) => asking.has(p.id))]
  const rows = view === 'needs' ? needs : view === 'approved' ? approved : declined
  const open = rows.find((r) => r.id === sp.id) ?? rows[0]
  const tab: Tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'overview'
  const isAdmin = isMasterAdmin(staff.role)
  const [team, keys] = open?.approvedAt ? await Promise.all([
    partnerTeamForAdmin(staff, open.id).catch(() => null),
    staffProof(staff.userId).then((proof) => (proof ? ownerPasskeys(staff, proof, open.id).catch(() => null) : null)),
  ]) : [null, null]
  const base = (id: string) => `/admin/partners?${view === 'needs' ? '' : `view=${view}&`}id=${id}`
  const chip = (p: AdminPartner) => asking.has(p.id) ? <Badge tone="warn">Passkey</Badge> : !p.approvedAt && !p.declinedAt ? <Badge>To review</Badge>
    : p.suspendedAt ? <Badge tone="warn">Suspended</Badge> : p.approvedAt ? <Badge tone="ok">Approved</Badge> : <Badge>Declined</Badge>

  const more: DialogSpec[] = open?.approvedAt && isAdmin ? [open.suspendedAt
    ? { label: 'Reinstate…', title: `Reinstate ${nameOf(open)}?`, description: 'Their team gets its stores back at once.', action: reinstatePartnerAction, keep: 'Keep suspended', go: `Reinstate ${nameOf(open)}`,
        fields: <><input type="hidden" name="id" value={open.id} /><input type="hidden" name="name" value={nameOf(open)} />
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Type {nameOf(open)} to confirm</span><input name="typed" maxLength={120} autoComplete="off" className={FIELD} /><FieldMessage name="typed" /></label></> }
    : { label: 'Suspend…', title: `Suspend ${nameOf(open)}?`, description: 'Their team loses every store at once. Each brand is told.', action: suspendPartnerAction, keep: 'Keep access', go: `Suspend ${nameOf(open)}`, danger: true,
        fields: <><input type="hidden" name="id" value={open.id} /><input type="hidden" name="name" value={nameOf(open)} />
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Reason to suspend</span><input name="reason" maxLength={300} className={FIELD} /><FieldMessage name="reason" /></label>
          <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Type {nameOf(open)} to confirm</span><input name="typed" maxLength={120} autoComplete="off" className={FIELD} /><FieldMessage name="typed" /></label></> }] : []

  return (
    <>
      <PageHeader title="Partners" />
      <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="min-w-0">
          <ViewTabs label="Views" tabs={VIEWS.map(([k, label]) => ({ href: k === 'needs' ? '/admin/partners' : `/admin/partners?view=${k}`, label, count: k === 'needs' ? needs.length : counts[k], current: k === view }))} />
          {rows.length === 0 ? <Panel title={view === 'needs' ? 'Nothing waits.' : `No ${view} partners`} /> : (
            <ul data-list className="mt-2 divide-y divide-line-soft">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={base(r.id)} aria-current={open?.id === r.id || undefined} className={`flex flex-col gap-0.5 rounded-md px-3 py-2.5 text-sm hover:bg-accent ${open?.id === r.id ? 'bg-accent' : ''}`}>
                    <span className="flex items-center justify-between gap-2"><b className="truncate font-medium">{nameOf(r)}</b>{chip(r)}</span>
                    <span className="truncate text-muted-foreground">{r.name} · {r.city} · {r.approvedAt ? `${r.stores} ${r.stores === 1 ? 'store' : 'stores'}` : `applied ${sinceIN(r.appliedAt, now)}`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {open && (
          <Section ariaLabel={nameOf(open)} className="min-w-0 text-sm"
            title={<span className="flex flex-wrap items-center gap-2">{nameOf(open)}{chip(open)}</span>}
            action={<MoreDialogs specs={more} />}>
            {!open.approvedAt && !open.declinedAt && (
              <NeedsBand tone="info" title={`${nameOf(open)} applied to be a partner.`} line={`${open.name} · ${open.city} · ${sinceIN(open.appliedAt, now)}`}
                action={isAdmin ? <div className="flex flex-wrap gap-2">
                  <DialogButton spec={{ label: 'Decline…', title: `Decline ${nameOf(open)}?`, description: 'They read the reason in their email.', action: decidePartnerAction, keep: 'Keep in review', go: `Decline ${nameOf(open)}`, danger: true,
                    fields: <><input type="hidden" name="id" value={open.id} /><input type="hidden" name="decision" value="decline" />
                      <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Reason to decline</span><input name="reason" maxLength={300} className={FIELD} /><FieldMessage name="reason" /></label></> }} />
                  <ActionForm action={decidePartnerAction}><input type="hidden" name="id" value={open.id} /><input type="hidden" name="decision" value="approve" /><Submit size="wrap">Approve {nameOf(open)}</Submit></ActionForm>
                </div> : 'A master admin decides applications.'} />
            )}
            {asking.has(open.id) && keys?.request && (
              <NeedsBand title={`${keys.owner} asks for a first passkey.`}
                line={[`call ${/^91\d{10}$/.test(keys.phone) ? `+91 ${keys.phone.slice(2, 7)} ${keys.phone.slice(7)}` : keys.phone}`, keys.request.device, keys.request.city].filter(Boolean).join(' · ')}
                action={tab === 'passkeys' ? undefined : <Link href={`${base(open.id)}&tab=passkeys`} className={button()}>Approve passkey</Link>} />
            )}
            {open.approvedAt && <ViewTabs label={nameOf(open)} tabs={TABS.map(([k, label]) => ({ href: `${base(open.id)}${k === 'overview' ? '' : `&tab=${k}`}`, label, count: k === 'team' ? team?.length : undefined, current: tab === k }))} />}

            {(tab === 'overview' || !open.approvedAt) && (
              <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2">
                <dt className="text-muted-foreground">Owner</dt><dd>{open.name} <span className="font-num text-muted-foreground">· {open.email}</span></dd>
                <dt className="text-muted-foreground">WhatsApp</dt><dd className="font-num">{formatPhone(open.phone)}</dd>
                <dt className="text-muted-foreground">City</dt><dd>{open.city}</dd>
                {open.approvedAt ? <>
                  <dt className="text-muted-foreground">Stores</dt><dd className="font-num">{open.stores}</dd>
                  <dt className="text-muted-foreground">Since</dt><dd>{dayMonthIN(open.approvedAt)}</dd>
                </> : <>
                  <dt className="text-muted-foreground">Does</dt><dd>{open.services.map((s) => PARTNER_SERVICES.find(([k]) => k === s)?.[1] ?? s).join(', ') || '—'}</dd>
                  <dt className="text-muted-foreground">Work</dt><dd className="break-all">{open.workUrl || '—'}</dd>
                  <dt className="text-muted-foreground">Brands now</dt><dd>{BRANDS_NOW.find(([k]) => k === open.brandsNow)?.[1]}</dd>
                  <dt className="text-muted-foreground">Terms</dt><dd>Version {open.termsVersion}, {dateTimeIN(open.agreedAt)}</dd>
                </>}
                {open.declineReason && <><dt className="text-muted-foreground">Declined</dt><dd>{open.declineReason}</dd></>}
                {open.suspendedAt && <><dt className="text-muted-foreground">Suspended</dt><dd>{dayMonthIN(open.suspendedAt)}{open.suspendReason ? ` · ${open.suspendReason}` : ''}</dd></>}
              </dl>
            )}
            {tab === 'team' && open.approvedAt && (team ? (
              <div className="divide-y divide-line-soft">
                {team.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate font-num">{m.email}</span>
                    <span className="flex items-center gap-2"><Badge tone={m.role === 'owner' ? 'info' : 'neutral'}>{m.role === 'owner' ? 'Owner' : 'Lead'}</Badge>
                      <span className="text-muted-foreground">{m.role === 'owner' ? 'every store' : m.acceptedAt ? `${m.stores} ${m.stores === 1 ? 'store' : 'stores'}` : 'invited'}</span></span>
                  </div>
                ))}
              </div>
            ) : <p className="text-muted-foreground">The team couldn&apos;t be read. Reload to try again.</p>)}
            {tab === 'passkeys' && open.approvedAt && (pk.off ? <p className="text-muted-foreground">Passkeys are off</p>
              : keys ? <OwnerPasskeysPanel partnerId={open.id} s={keys} now={now.toISOString()} admin={isAdmin} /> : <p className="text-muted-foreground">Confirm it&apos;s you to see passkeys.</p>)}
          </Section>
        )}
      </div>
    </>
  )
}

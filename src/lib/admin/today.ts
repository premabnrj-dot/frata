import 'server-only'
import { cache } from 'react'
import { and, asc, eq, gt, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { invites, tenants } from '@/lib/db/schema'
import { frrataInvoices, frrataPayments } from '@/lib/db/schema-billing'
import type { StaffOk } from '@/lib/auth/require-staff'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { errName } from '@/lib/log'
import { countsOf, orderItems, sourcesFor, type TodayArea, type TodayItem, type TodayKind } from '@/domains/admin/today'
import { listPartners } from './partners'
import { domainsNeedingFrrata } from './addresses'
import { trialList } from './trials'
import { themeVersionsForAdmin } from './themes'

// =============================================================================
// FILE: src/lib/admin/today.ts — ADMIN › TODAY AND THE NAV COUNTS (Neel N4; plan, reviews folded in). Each source
// the caller's role may see (domains/admin/today.ts) is read on its own; a source that fails is logged and left out
// ("uncounted", never 0), so one slow or broken read never takes Admin down. Per request (React cache), never shared
// across staff. Every read here is a count or a short list over indexed columns (speed review on the plan).
// =============================================================================

const DAY = 86_400_000
const inr = (p: number) => formatInr(paise(p))
const ago = (d: Date, now: Date) => { const n = Math.floor((now.getTime() - d.getTime()) / DAY); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago` }
const MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })

type Reader = (staff: StaffOk, now: Date) => Promise<TodayItem[]>

const READERS: Record<TodayKind, Reader> = {
  partner_passkey: async (staff, now) => passkeys(staff, now, 'partner'),
  staff_passkey: async (staff, now) => passkeys(staff, now, 'staff'),
  overpaid: async (_staff, now) => {
    const rows = await adminDb().select({ id: frrataInvoices.id, number: frrataInvoices.number, shop: tenants.name, over: frrataPayments.overPaid, at: frrataPayments.capturedAt })
      .from(frrataPayments).innerJoin(frrataInvoices, and(eq(frrataInvoices.tenantId, frrataPayments.tenantId), eq(frrataInvoices.id, frrataPayments.invoiceId)))
      .innerJoin(tenants, eq(tenants.id, frrataPayments.tenantId))
      .where(and(gt(frrataPayments.overPaid, 0), isNull(frrataPayments.refundedAt), isNotNull(frrataPayments.capturedAt), eq(frrataInvoices.testMode, false)))
      .orderBy(asc(frrataPayments.createdAt)).limit(20)
    return rows.map((r) => ({ kind: 'overpaid' as const, key: r.id + (r.at?.toISOString() ?? ''), title: `${r.shop} paid ${inr(Number(r.over))} too much`,
      line: `${r.number ?? 'Invoice'}${r.at ? ` · paid ${ago(r.at, now)}` : ''}`, action: 'Record refund', href: `/admin/billing/invoice/${r.id}`, since: r.at }))
  },
  issue_run: async (_staff, now) => {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 5.5 * 3_600_000)
    const [r] = await adminDb().select({ n: sql<number>`count(*)::int`, first: sql<Date | null>`min(${frrataInvoices.periodStart})`, drafted: sql<Date | null>`min(${frrataInvoices.draftedAt})` })
      .from(frrataInvoices).where(and(isNull(frrataInvoices.number), eq(frrataInvoices.testMode, false), lt(frrataInvoices.periodStart, monthStart)))
    if (!r || !r.n || !r.first) return []
    const month = MONTH.format(new Date(r.first))
    return [{ kind: 'issue_run', key: month, title: `${month}'s invoices wait to be issued`, line: `${r.n} drafts`, action: 'Open Billing', href: '/admin/billing', since: r.drafted ? new Date(r.drafted) : null }]
  },
  address_claim: async (staff, now) => (await domainsNeedingFrrata(staff)).map((d) => ({
    kind: 'address_claim' as const, key: d.id,
    title: d.contestAt ? `${d.shop} claims ${d.host}` : `${d.host} isn't working`,
    line: d.contestAt ? `Another store's main address · ${ago(d.contestAt, now)}` : `${d.shop}${d.failingSince ? ` · since ${ago(d.failingSince, now)}` : ''}`,
    action: 'Review claim', href: '/admin/names', since: d.contestAt ?? d.failingSince ?? d.claimedAt,
  })),
  partner_review: async (staff, now) => (await listPartners(staff, 'review')).slice(0, 20).map((p) => ({
    kind: 'partner_review' as const, key: p.id, title: `${p.businessName || p.name} applied to be a partner`,
    line: [p.name, p.city, ago(p.appliedAt, now)].filter(Boolean).join(' · '), action: 'Review application', href: `/admin/partners?id=${p.id}`, since: p.appliedAt,
  })),
  trial_ending: async (staff, now) => (await trialList(staff, now))
    .filter((t) => (t.state === 'ending' || t.state === 'grace') && !t.autopay && t.daysLeft <= 3)
    .map((t) => ({ kind: 'trial_ending' as const, key: t.tenantId,
      title: t.daysLeft <= 0 ? `${t.name}'s trial has ended. No autopay yet.` : `${t.name}'s trial ends in ${t.daysLeft} ${t.daysLeft === 1 ? 'day' : 'days'}. No autopay yet.`,
      line: 'Trial', action: `Open ${t.name}`, href: `/admin/merchants/${t.tenantId}/plan`, since: new Date(t.lastDay.getTime() - 3 * DAY) })),
  owner_waiting: async (_staff, now) => {
    const rows = await adminDb().select({ tenantId: invites.tenantId, name: tenants.name, at: invites.createdAt }).from(invites).innerJoin(tenants, eq(tenants.id, invites.tenantId))
      .where(and(eq(invites.role, 'owner'), isNull(invites.acceptedAt), isNull(invites.revokedAt), lt(invites.createdAt, new Date(now.getTime() - 3 * DAY))))
      .orderBy(asc(invites.createdAt)).limit(20)
    return rows.map((r) => ({ kind: 'owner_waiting' as const, key: r.tenantId, title: `${r.name}'s owner hasn't signed in`, line: `Added ${ago(r.at, now)}`,
      action: `Open ${r.name}`, href: `/admin/merchants/${r.tenantId}`, since: r.at }))
  },
  theme_new: async (staff) => (await themeVersionsForAdmin(staff)).filter((v) => v.state === 'deployed').map((v) => ({
    kind: 'theme_new' as const, key: `${v.key}@${v.version}`, title: `${v.name} ${v.version} is new in this deploy`, line: 'Add pilot stores, then release it',
    action: `Open ${v.name} ${v.version}`, href: `/admin/themes/${v.key}/${v.version}`, since: null,
  })),
}

async function passkeys(staff: StaffOk, now: Date, kind: 'partner' | 'staff'): Promise<TodayItem[]> {
  const rows = await waitingPasskeys(staff)
  return rows.filter((r) => r.kind === kind).map((r) => ({
    kind: kind === 'partner' ? 'partner_passkey' as const : 'staff_passkey' as const, key: r.ref,
    title: `${r.name} asks for a passkey`, line: `Waiting ${ago(r.since, now)}`, action: 'Approve passkey',
    href: kind === 'partner' ? `/admin/partners?view=approved&id=${r.ref}` : '/admin/staff', since: r.since,
  }))
}

/** One call for both passkey sources (admin_waiting_passkeys, 0138: master admin only, checked in the database). */
const waitingPasskeys = cache(async (staff: StaffOk) => {
  const rows = await adminDb().execute<{ kind: 'partner' | 'staff'; ref: string; name: string; since: Date | string }>(sql`select * from admin_waiting_passkeys(${staff.userId}::uuid)`)
  return [...rows].map((r) => ({ ...r, since: new Date(r.since) }))
})

/** Every item this person may see; a failing source is logged and left out. */
export const todayItems = cache(async (staff: StaffOk): Promise<{ items: TodayItem[]; missed: TodayKind[] }> => {
  const now = new Date()
  const sources = sourcesFor(staff.role)
  const missed: TodayKind[] = []
  const lists = await Promise.all(sources.map((s) => READERS[s.kind](staff, now).catch((err) => { console.error('[admin today]', s.kind, errName(err)); missed.push(s.kind); return [] })))
  return { items: orderItems(lists.flat()), missed }
})

/** The nav's counts: the same items, counted by area. Late (over 1.5 s) or failed: no counts at all. */
export async function todayCounts(staff: StaffOk): Promise<Partial<Record<TodayArea, number>> | null> {
  const late = new Promise<null>((r) => setTimeout(() => r(null), 1_500))
  const got = await Promise.race([todayItems(staff).then((t) => countsOf(t.items)), late])
  return got
}

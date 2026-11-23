import 'server-only'
import { cache } from 'react'
import { and, asc, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { invites, tenants } from '@/lib/db/schema'
import { billingAccounts, frrataInvoices, frrataPayments } from '@/lib/db/schema-billing'
import type { StaffOk } from '@/lib/auth/require-staff'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { errName } from '@/lib/log'
import { countsOf, orderItems, sourcesFor, type TodayArea, type TodayItem, type TodayKind } from '@/domains/admin/today'
import { shopTrials } from '@/lib/db/schema-trials'
import { themeVersions } from '@/lib/db/schema-themes'
import { trialView } from './trials'
import { monthStartIST } from '@/domains/time/month'
import { codeSource } from '@/domains/themes/source'
import { listPartners } from './partners'
import { dueCostItems } from './costs'
import { domainsNeedingFrrata } from './addresses'
import { apiShops } from './storefront-api'
import { apiShopState } from '@/domains/storefront-api/admin-view'
import { istDayKey } from '@/domains/time/day'

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
    return rows.map((r) => ({ kind: 'overpaid' as const, key: r.id + (r.at?.toISOString() ?? ''), title: `${r.shop} paid ${inr(Number(r.over))} more than due`,
      line: `${r.number ?? 'Invoice'}${r.at ? ` · paid ${ago(r.at, now)}` : ''}`, action: 'Record refund', href: `/admin/billing/invoice/${r.id}`, since: r.at }))
  },
  cost_due: async (staff, now) => dueCostItems(staff, istDayKey(now)),
  issue_run: async (_staff, now) => {
    const monthStart = monthStartIST(now)
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
  // One join, open trials without autopay only (speed review on the plan, MED 1: never the whole Trials list).
  trial_ending: async (_staff, now) => (await adminDb().select({ f: shopTrials, name: tenants.name })
    .from(shopTrials).innerJoin(tenants, eq(tenants.id, shopTrials.tenantId)).leftJoin(billingAccounts, eq(billingAccounts.tenantId, shopTrials.tenantId))
    .where(and(isNull(shopTrials.endedAt), or(isNull(billingAccounts.mandateAt), isNotNull(billingAccounts.mandateRevokedAt)))))
    .map(({ f, name }) => ({ tenantId: f.tenantId, name, ...trialView(f, now, false) }))
    .filter((t) => (t.state === 'ending' || t.state === 'grace') && t.daysLeft <= 3)
    .map((t) => ({ kind: 'trial_ending' as const, key: t.tenantId, tenantId: t.tenantId, need: `Trial ${t.daysLeft <= 0 ? 'ended' : `ends in ${t.daysLeft} ${t.daysLeft === 1 ? 'day' : 'days'}`} · no autopay`,
      title: t.daysLeft <= 0 ? `${t.name}'s trial has ended. No autopay yet.` : `${t.name}'s trial ends in ${t.daysLeft} ${t.daysLeft === 1 ? 'day' : 'days'}. No autopay yet.`,
      line: 'Trial', action: `Open ${t.name}`, href: `/admin/merchants/${t.tenantId}/plan`, since: new Date(t.lastDay.getTime() - 3 * DAY) })),
  owner_waiting: async (_staff, now) => {
    const rows = await adminDb().select({ tenantId: invites.tenantId, name: tenants.name, at: invites.createdAt }).from(invites).innerJoin(tenants, eq(tenants.id, invites.tenantId))
      .where(and(eq(invites.role, 'owner'), isNull(invites.acceptedAt), isNull(invites.revokedAt), lt(invites.createdAt, new Date(now.getTime() - 3 * DAY))))
      .orderBy(asc(invites.createdAt)).limit(20)
    return rows.map((r) => ({ kind: 'owner_waiting' as const, key: r.tenantId, tenantId: r.tenantId, need: 'Owner hasn’t signed in', title: `${r.name}'s owner hasn't signed in`, line: `Added ${ago(r.at, now)}`,
      action: `Open ${r.name}`, href: `/admin/merchants/${r.tenantId}`, since: r.at }))
  },
  // A version in this build with no row yet is new in this deploy (versionState 'deployed'): the small table only,
  // never every shop's publishes (speed review on the plan, HIGH 2).
  theme_new: async () => {
    const rows = await adminDb().select({ key: themeVersions.themeKey, version: themeVersions.version }).from(themeVersions)
    const known = new Set(rows.map((r) => `${r.key}@${r.version}`))
    return codeSource.keys().flatMap((k) => codeSource.versions(k)).filter((m) => !known.has(`${m.key}@${m.version}`)).map((v) => ({
    kind: 'theme_new' as const, key: `${v.key}@${v.version}`, title: `${v.name} ${v.version} is new in this deploy`, line: 'Add pilot stores, then release it',
    action: `Open ${v.name} ${v.version}`, href: `/admin/themes/${v.key}/${v.version}`, since: null,
  }))
  },
  // SA1b: an open store whose own website hasn't read the API since the day before yesterday (one aggregate definer,
  // counts and dates only: speed review 33 ms; never a key).
  site_no_reads: async (staff, now) => {
    const today = istDayKey(now)
    return (await apiShops(staff)).filter((r) => apiShopState(r, today) === 'no_reads').slice(0, 20).map((r) => ({
      kind: 'site_no_reads' as const, key: r.tenantId, tenantId: r.tenantId, need: 'Website reads nothing',
      title: `${r.name}'s website hasn't read the store for 2 days`, line: r.lastRead ? `Last read ${r.lastRead}` : 'Never read',
      action: `Open ${r.name}`, href: `/admin/storefront-api?id=${r.tenantId}`, since: r.lastRead ? new Date(`${r.lastRead}T00:00:00+05:30`) : r.openedAt,
    }))
  },
}

async function passkeys(staff: StaffOk, now: Date, kind: 'partner' | 'staff'): Promise<TodayItem[]> {
  const rows = await waitingPasskeys(staff.userId)
  return rows.filter((r) => r.kind === kind).map((r) => ({
    kind: kind === 'partner' ? 'partner_passkey' as const : 'staff_passkey' as const, key: r.ref,
    title: `${r.name} asks for a passkey`, line: `Waiting ${ago(r.since, now)}`, action: 'Approve passkey',
    href: kind === 'partner' ? `/admin/partners?view=approved&id=${r.ref}` : '/admin/staff', since: r.since,
  }))
}

/** One call for both passkey sources (admin_waiting_passkeys, 0138: master admin only, checked in the database). */
const waitingPasskeys = cache(async (userId: string) => {
  const rows = await adminDb().execute<{ kind: 'partner' | 'staff'; ref: string; name: string; since: Date | string }>(sql`select * from admin_waiting_passkeys(${userId}::uuid)`)
  return [...rows].map((r) => ({ ...r, since: new Date(r.since) }))
})

type Gathered = { items: TodayItem[]; missed: TodayKind[] }
// Keyed by the person, not the StaffOk object: the layout's counts and the page's list share one gather per request
// (speed review on the plan, HIGH 1). Plain parallel reads, never a transaction holding one of Admin's two connections.
const slot = cache((_userId: string): { p: Promise<Gathered> | null } => ({ p: null }))

/** Every item this person may see; a failing source is logged and left out. */
export function todayItems(staff: StaffOk): Promise<Gathered> {
  const s = slot(staff.userId)
  return (s.p ??= gather(staff))
}

async function gather(staff: StaffOk): Promise<Gathered> {
  const now = new Date()
  const sources = sourcesFor(staff.role)
  const missed: TodayKind[] = []
  // One source at a time, each with its own limit (production, 2026-11-15: nine reads at once on Admin's two pooled
  // connections left one stuck mid-transaction and the page loading for ever). A late or failing source is left out
  // and named ("Couldn't check"), never waited on: Today always renders. The whole gather stays under ~4 s.
  const lists: TodayItem[][] = []
  const until = Date.now() + 4_000
  for (const s of sources) {
    const left = until - Date.now()
    if (left <= 0) { missed.push(s.kind); continue }
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<'late'>((r) => { timer = setTimeout(() => r('late'), Math.min(1_500, left)) })
    try {
      const got = await Promise.race([READERS[s.kind](staff, now), late])
      if (got === 'late') { console.error('[admin today]', s.kind, 'late'); missed.push(s.kind) } else lists.push(got)
    } catch (err) {
      console.error('[admin today]', s.kind, errName(err)); missed.push(s.kind)
    } finally { clearTimeout(timer) }
  }
  return { items: orderItems(lists.flat()), missed }
}

/** The nav's counts: the same items, counted by area. Late (over 1.5 s) or failed: no counts at all. */
export async function todayCounts(staff: StaffOk): Promise<Partial<Record<TodayArea, number>> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((r) => { timer = setTimeout(() => r(null), 1_500) })
  // A source that failed makes every count partial: no counts then, as when late (impact review on the diff).
  const got = await Promise.race([todayItems(staff).then((t) => (t.missed.length ? null : countsOf(t.items))), late])
  clearTimeout(timer)
  return got
}

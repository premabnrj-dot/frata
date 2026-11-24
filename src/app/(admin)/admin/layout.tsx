import { railFrom } from '@/components/shell/rail'
import { cookies } from 'next/headers'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AppShell } from '@/components/shell/app-shell'
import type { NavItem } from '@/components/shell/nav'
import { NavPill } from '@/components/shell/nav'
import { todayCounts } from '@/lib/admin/today'
import type { TodayArea } from '@/domains/admin/today'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { adminHealth } from '@/lib/admin/health'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { requireMember, ANY_MEMBER } from '@/lib/auth/require-member'
import { gateState } from '@/lib/admin/passkeys'
import { StaffGate } from '@/components/passkeys/passkey-gate'
import { signOutAction } from './sign-out/actions'
import { Toaster } from '@/components/ui/toast'
import { Banner } from '@/components/ui/banner'
import { Icon } from '@/components/icons/icon'
import { isMasterAdmin } from '@/domains/tenancy/staff-words'
import { passkeys } from '@/lib/auth/session'
import { TurnPasskeysOn } from './staff/passkeys-switch'
import { RateBanner } from './_components/rate-banner'
import { newestRateDay } from '@/lib/admin/fx-rate'
import { rateState } from '@/domains/studio/rate-state'
import { istDayKey } from '@/domains/time/day'

export const dynamic = 'force-dynamic'

/** Tab titles "Merchants · Frrata Admin" (rule 11). */
export const metadata: Metadata = { title: { template: '%s · Frrata Admin', default: 'Frrata Admin' } }

/** The frame and the refusal. ⚠️ It guards nothing below: every page calls requireStaff itself. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(ANY_STAFF)
  // Staff passkeys (ADR-0007 amended 2026-11-12): no page renders until this browser session has passed the check.
  if (!staff.ok && staff.reason === 'needs_passkey') {
    const state = await gateState(staff.identity).catch(() => 'error' as const)
    if (state === 'error') return <main data-shell data-neel="" className="p-6"><Panel title="Frrata Admin cannot reach the database">Try again in a minute.</Panel></main>
    return <Toaster calm><StaffGate email={staff.identity.email} state={state}
      signOut={<form action={signOutAction}><button type="submit" className="text-sm underline underline-offset-4">Sign out</button></form>} /></Toaster>
  }
  if (!staff.ok) {
    return (
      <main data-shell data-neel="" className="p-6">
        <Panel title={staff.reason === 'not_configured' ? staff.message : 'Frrata Admin is for Frrata staff'}
          action={<Link href="/console" className={button({ variant: 'secondary' })}>Go to your console</Link>}>
          {staff.reason === 'not_configured' && <>Set <code>ADMIN_DATABASE_URL</code> in Vercel (Production), then redeploy.</>}
        </Panel>
      </main>
    )
  }
  const health = await adminHealth(staff)
  if (!health.ok) {
    return (
      <main data-shell data-neel="" className="p-6">
        <Panel title={health.why === 'login_refused' ? 'Frrata Admin cannot sign in to the database' : 'Frrata Admin cannot reach the database'}>
          {health.why === 'login_refused'
            ? <>Supabase refused the <code>frata_admin</code> login. Set its password in the SQL Editor (<code>alter role frata_admin with password &apos;…&apos;</code>). Use the same value in <code>ADMIN_DATABASE_URL</code> in Vercel, then redeploy. See docs/setup.md § 6.</>
            : <>Check <code>ADMIN_DATABASE_URL</code> in Vercel points at the Transaction pooler (port 6543), then redeploy.</>}
        </Panel>
      </main>
    )
  }
  // Both at once (speed review on the plan): neither waits on the other.
  const [own, n, pk, newest] = await Promise.all([requireMember(ANY_MEMBER), todayCounts(staff).catch(() => null), passkeys(),
    newestRateDay().catch(() => undefined)])
  // The dollar rate (V3b K2, mockup docs/mockups/2026-11-24-v3b-first.html § 1): ageing from its third day, then stopped.
  // One banner at a time (Neel § Banners): Studio stopped first, then passkeys off, then the rate ageing.
  const rate = newest === undefined ? null : rateState(newest, istDayKey(new Date()))
  const ownStore = own.ok && !own.membership.supportSessionId ? own.membership.tenantName : null
  // The same shell as the console; Admin differs only in chrome (ink, reversed mark, STAFF). Neel N4 (owner-approved
  // mockup): Today first, then four groups, each item with the count of what waits in it (todayCounts, the same list
  // Today shows, filtered by this person's role; none when it can't be read).
  const item = (href: string, label: string, icon: NavItem['icon'], key?: TodayArea): NavItem => ({ href, label, icon, ...(key && n?.[key] ? { badge: <NavPill n={n[key]!} label="waiting" /> } : {}) })
  const today = item('/admin', 'Today', 'home', 'today')
  const merchants = item('/admin/merchants', 'Merchants', 'merchants', 'merchants')
  const trialsItem = item('/admin/trials', 'Trials', 'activity', 'trials')
  const offersItem = item('/admin/offers', 'Offers', 'offers')
  const namesItem = item('/admin/names', 'Names', 'address', 'names')
  // Storefront API (SA1b mockup § Admin): stores whose own website reads nothing count here and on Today.
  const apiItem = item('/admin/storefront-api', 'Storefront API', 'code', 'storefront_api')
  const partnersItem = item('/admin/partners', 'Partners', 'partners', 'partners')
  const staffItem = item('/admin/staff', 'Staff', 'staff', 'staff')
  const plans = item('/admin/plans', 'Plans', 'plans')
  const billingItem = item('/admin/billing', 'Billing', 'payments', 'billing')
  // Costs is a master admin's page; support staff are not shown it (the page and every action refuse them too).
  const costsItems = (ADMIN_ONLY as readonly string[]).includes(staff.role) ? [item('/admin/costs', 'Costs', 'costs', 'costs'), item('/admin/cashflow', 'Cashflow', 'cashflow', 'cash'), item('/admin/rate', 'Dollar rate', 'bank')] : []
  const appsItem = item('/admin/apps', 'Apps', 'apps')
  const ekcodeItem = item('/admin/ekcode', 'EkCode', 'people')
  const themesItem = item('/admin/themes', 'Themes', 'themes', 'themes')
  const noticesItem = item('/admin/notices', 'Notices', 'bell')
  const emailItem = item('/admin/email', 'Email health', 'messages')
  const infraItem = item('/admin/infrastructure', 'Infrastructure', 'risk')
  const activity = item('/admin/activity', 'Activity', 'activity')
  const foot: NavItem[] = ownStore ? [{ href: '/console', label: `${ownStore} console`, icon: 'external' }] : []
  const groups = [
    { label: '', items: [today] },
    { label: 'Merchants', items: [merchants, trialsItem, offersItem, namesItem, apiItem] },
    { label: 'People', items: [partnersItem, staffItem] },
    { label: 'Money', items: [plans, billingItem, ...costsItems] },
    { label: 'Platform', items: [appsItem, ekcodeItem, themesItem, noticesItem, emailItem, infraItem, activity] },
  ]
  return (
    <AppShell rail={railFrom((await cookies()).get('rail')?.value)} ink title="Frrata Admin" tag="STAFF" navLabel="Frrata Admin" groups={groups}
      tabs={[today, merchants, partnersItem]} more={[trialsItem, offersItem, namesItem, apiItem, staffItem, plans, billingItem, ...costsItems, appsItem, ekcodeItem, themesItem, noticesItem, emailItem, infraItem, activity]} foot={foot} email={staff.email}>
      {/* Passkeys off from Admin › Staff (owner 2026-11-23, docs/mockups/2026-11-23-admin-passkeys-switch.html § Off):
          on every Admin page until an Admin turns them on; Support staff see it without the button. */}
      {rate && (rate.kind === 'none' || rate.kind === 'lapsed') && <RateBanner state={rate} admin={isMasterAdmin(staff.role)} />}
      {!(rate && (rate.kind === 'none' || rate.kind === 'lapsed')) && pk.off && <Banner tone="warn" title={<span className="inline-flex items-center gap-2.5"><Icon name="key" className="size-4" />Passkeys are off</span>} action={isMasterAdmin(staff.role)
        ? <TurnPasskeysOn /> : undefined} />}
      {!pk.off && rate && (rate.kind === 'ageing' || rate.kind === 'last') && <RateBanner state={rate} admin={isMasterAdmin(staff.role)} />}
      {children}
    </AppShell>
  )
}

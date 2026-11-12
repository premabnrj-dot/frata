import Link from 'next/link'
import type { Metadata } from 'next'
import { AppShell } from '@/components/shell/app-shell'
import type { NavItem } from '@/components/shell/nav'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { adminHealth } from '@/lib/admin/health'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { requireMember, ANY_MEMBER } from '@/lib/auth/require-member'
import { gateState } from '@/lib/admin/passkeys'
import { StaffGate } from './_components/staff-gate'
import { signOutAction } from './sign-out/actions'
import { Toaster } from '@/components/ui/toast'

export const dynamic = 'force-dynamic'

/** Tab titles "Merchants · Frrata Admin" (rule 11). */
export const metadata: Metadata = { title: { template: '%s · Frrata Admin', default: 'Frrata Admin' } }

/** The frame and the refusal. ⚠️ It guards nothing below: every page calls requireStaff itself. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(ANY_STAFF)
  // Staff passkeys (ADR-0007 amended 2026-11-12): no page renders until this browser session has passed the check.
  if (!staff.ok && staff.reason === 'needs_passkey') {
    const state = await gateState(staff.identity).catch(() => 'error' as const)
    if (state === 'error') return <main data-shell data-neel="" className="p-6"><Panel title="Admin cannot reach the database">Try again in a minute.</Panel></main>
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
        <Panel title={health.why === 'login_refused' ? 'Admin cannot sign in to the database' : 'Admin cannot reach the database'}>
          {health.why === 'login_refused'
            ? <>Supabase refused the <code>frata_admin</code> login. Set its password in the SQL Editor (<code>alter role frata_admin with password &apos;…&apos;</code>), use the same value in <code>ADMIN_DATABASE_URL</code> in Vercel, then redeploy. See docs/setup.md § 6.</>
            : <>Check <code>ADMIN_DATABASE_URL</code> in Vercel points at the Transaction pooler (port 6543), then redeploy.</>}
        </Panel>
      </main>
    )
  }
  const own = await requireMember(ANY_MEMBER)
  const ownStore = own.ok && !own.membership.supportSessionId ? own.membership.tenantName : null
  // The same shell as the console; Admin differs only in chrome (ink, reversed mark, STAFF). No count pill (plan U · A9).
  const merchants: NavItem = { href: '/admin/merchants', label: 'Merchants', icon: 'merchants' }
  const plans: NavItem = { href: '/admin/plans', label: 'Plans', icon: 'plans' }
  const billingItem: NavItem = { href: '/admin/billing', label: 'Billing', icon: 'payments' }
  const modulesItem: NavItem = { href: '/admin/modules', label: 'Modules', icon: 'apps' }
  const ekcodeItem: NavItem = { href: '/admin/ekcode', label: 'EkCode', icon: 'people' }
  const themesItem: NavItem = { href: '/admin/themes', label: 'Themes', icon: 'themes' }
  const offersItem: NavItem = { href: '/admin/offers', label: 'Offers', icon: 'offers' }
  const partnersItem: NavItem = { href: '/admin/partners', label: 'Partners', icon: 'partners' }
  const namesItem: NavItem = { href: '/admin/names', label: 'Names', icon: 'address' }
  const trialsItem: NavItem = { href: '/admin/trials', label: 'Trials', icon: 'activity' }
  const noticesItem: NavItem = { href: '/admin/notices', label: 'Notices', icon: 'bell' }
  const emailItem: NavItem = { href: '/admin/email', label: 'Email health', icon: 'messages' }
  const staffItem: NavItem = { href: '/admin/staff', label: 'Staff', icon: 'staff' }
  const activity: NavItem = { href: '/admin/activity', label: 'Activity', icon: 'activity' }
  const infraItem: NavItem = { href: '/admin/infrastructure', label: 'Infrastructure', icon: 'risk' }
  const foot: NavItem[] = ownStore ? [{ href: '/console', label: `${ownStore} console`, icon: 'external' }] : []
  return (
    <AppShell ink title="Frrata Admin" tag="STAFF" navLabel="Admin" groups={[{ label: 'Merchants', items: [merchants, trialsItem, partnersItem, plans, billingItem, modulesItem, ekcodeItem, themesItem, offersItem, namesItem] }, { label: 'Frrata', items: [noticesItem, emailItem, infraItem, staffItem, activity] }]}
      tabs={[merchants, plans, staffItem]} more={[trialsItem, partnersItem, billingItem, modulesItem, ekcodeItem, themesItem, offersItem, namesItem, noticesItem, emailItem, infraItem, activity]} foot={foot} email={staff.email}>
      {children}
    </AppShell>
  )
}

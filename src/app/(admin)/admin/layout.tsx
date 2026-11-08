import Link from 'next/link'
import type { Metadata } from 'next'
import { AppShell } from '@/components/shell/app-shell'
import type { NavItem } from '@/components/shell/nav'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { adminHealth } from '@/lib/admin/health'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { requireMember, ANY_MEMBER } from '@/lib/auth/require-member'

export const dynamic = 'force-dynamic'

/** Tab titles "Merchants · Frrata Admin" (rule 11). */
export const metadata: Metadata = { title: { template: '%s · Frrata Admin', default: 'Frrata Admin' } }

/** The frame and the refusal. ⚠️ It guards nothing below: every page calls requireStaff itself. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) {
    return (
      <main data-shell className="p-6">
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
      <main data-shell className="p-6">
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
  const modulesItem: NavItem = { href: '/admin/modules', label: 'Modules', icon: 'apps' }
  const themesItem: NavItem = { href: '/admin/themes', label: 'Themes', icon: 'themes' }
  const offersItem: NavItem = { href: '/admin/offers', label: 'Offers', icon: 'offers' }
  const partnersItem: NavItem = { href: '/admin/partners', label: 'Partners', icon: 'partners' }
  const staffItem: NavItem = { href: '/admin/staff', label: 'Staff', icon: 'staff' }
  const activity: NavItem = { href: '/admin/activity', label: 'Activity', icon: 'activity' }
  const foot: NavItem[] = ownStore ? [{ href: '/console', label: `${ownStore} console`, icon: 'external' }] : []
  return (
    <AppShell ink title="Frrata Admin" tag="STAFF" navLabel="Admin" groups={[{ label: 'Merchants', items: [merchants, partnersItem, plans, modulesItem, themesItem, offersItem] }, { label: 'Frrata', items: [staffItem, activity] }]}
      tabs={[merchants, plans, staffItem]} more={[partnersItem, modulesItem, themesItem, offersItem, activity]} foot={foot} email={staff.email}>
      {children}
    </AppShell>
  )
}

import Link from 'next/link'
import { AdminNav } from '@/components/nav/admin-nav'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { adminHealth } from '@/lib/admin/health'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { requireMember, ANY_MEMBER } from '@/lib/auth/require-member'

export const dynamic = 'force-dynamic'

/** The frame and the refusal. ⚠️ It guards nothing below: every page calls requireStaff itself. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) {
    return (
      <main className="p-6">
        <Panel title={staff.reason === 'not_configured' ? staff.message : 'Frata Admin is for Frata staff'}
          action={<Link href="/console" className={button({ variant: 'secondary' })}>Go to your console</Link>}>
          {staff.reason === 'not_configured' && <>Set <code>ADMIN_DATABASE_URL</code> in Vercel (Production), then redeploy.</>}
        </Panel>
      </main>
    )
  }
  const health = await adminHealth(staff)
  if (!health.ok) {
    return (
      <main className="p-6">
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
  return (
    <div data-shell className={`flex min-h-dvh flex-col md:flex-row ${SHELL_FONT_VARS}`}>
      <AdminNav email={staff.email} ownStore={ownStore} />
      <main className="min-w-0 flex-1 space-y-6 p-4 md:p-6">{children}</main>
    </div>
  )
}

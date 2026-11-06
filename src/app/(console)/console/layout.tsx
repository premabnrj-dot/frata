import Link from 'next/link'
import { ConsoleNav } from '@/components/nav/console-nav'
import { SupportBanner } from '@/components/nav/support-banner'
import { supportVisit } from '@/lib/queries/support'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'

export const dynamic = 'force-dynamic'

/**
 * The shell, and the refusal panel. A refusal renders a panel rather than
 * redirecting: redirecting from a layout breaks the App Router (frata-gotchas).
 * ⚠️ This check does NOT protect the pages under it — they render in parallel.
 * Every page calls requireMember itself.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok && auth.reason === 'not_configured') {
    return (
      <main className="p-6">
        <Panel title={auth.message}>
          Set the Supabase and database variables listed in <code>.env.example</code> in Vercel, then redeploy.
        </Panel>
      </main>
    )
  }
  if (!auth.ok) {
    return (
      <main className="p-6">
        <Panel title={auth.reason === 'signed_out' ? 'Sign in to continue' : 'No store on this account'}
          action={<Link href="/login" className={button({ variant: 'secondary' })}>Sign in with another email</Link>}>
          {auth.reason === 'no_access' && 'This email is not a member of any store. Ask the store owner to invite you.'}
        </Panel>
      </main>
    )
  }
  const now = new Date()
  const visit = auth.membership.supportSessionId ? await supportVisit(auth.membership.tenantId, auth.membership.supportSessionId) : null
  return (
    <div className="flex min-h-dvh flex-col">
      {visit && <SupportBanner storeName={auth.membership.tenantName} visit={visit} now={now} />}
      <div className="flex flex-1 flex-col md:flex-row">
        <ConsoleNav storeName={auth.membership.tenantName} isStaff={auth.staffRole !== null} />
        <main className="min-w-0 flex-1 space-y-6 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

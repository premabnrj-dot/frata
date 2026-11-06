import Link from 'next/link'
import { ConsoleNav } from '@/components/nav/console-nav'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { isDatabaseConfigured } from '@/lib/env'
import { isAuthConfigured } from '@/lib/public-env'

export const dynamic = 'force-dynamic'

/**
 * Auth only, plus the shell. A refusal renders a panel rather than redirecting:
 * redirecting from a layout breaks the App Router (Ekatan, frata-gotchas).
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!isAuthConfigured() || !isDatabaseConfigured()) {
    return (
      <main className="p-6">
        <Panel title="Frata is not connected yet">
          Set the Supabase and database variables listed in <code>.env.example</code> in Vercel, then redeploy.
        </Panel>
      </main>
    )
  }
  const auth = await requireMember(ANY_MEMBER)
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
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <ConsoleNav storeName={auth.membership.tenantName} />
      <main className="min-w-0 flex-1 space-y-6 p-4 md:p-6">{children}</main>
    </div>
  )
}

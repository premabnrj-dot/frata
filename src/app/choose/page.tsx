import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { ROLE_LABEL } from '@/domains/tenancy/roles'
import { Wordmark } from '@/components/brand/wordmark'

export const dynamic = 'force-dynamic'

/** Staff who are also store members choose where to go after sign-in (approved mockup). */
export default async function ChoosePage() {
  const [staff, member] = await Promise.all([requireStaff(ANY_STAFF), requireMember(ANY_MEMBER)])
  if (!staff.ok) redirect('/console')
  if (!member.ok) redirect('/admin')
  const own = member.all.filter((m) => !m.supportSessionId)
  return (
    <main data-shell className={`flex min-h-dvh items-center justify-center p-4 ${SHELL_FONT_VARS}`}>
      <div className="w-full max-w-md space-y-4 rounded-md border border-border bg-card p-7">
        <div className="space-y-1">
          <Wordmark thread className="h-5" />
          <h1 className="font-display text-xl font-semibold tracking-tight">Where would you like to go?</h1>
          <p className="text-sm text-muted-foreground">Signed in as <span className="font-mono">{staff.email}</span></p>
        </div>
        <Link href="/admin" className="flex items-center gap-3 rounded-md border-2 border-primary p-4">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">FA</span>
          <span className="flex-1"><span className="block font-semibold">Frrata Admin</span><span className="text-sm text-muted-foreground">You are {staff.role === 'admin' ? 'an Admin' : 'Support'}</span></span>
        </Link>
        {own.map((m) => (
          <Link key={m.tenantId} href="/console" className="flex items-center gap-3 rounded-md border border-input p-4">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-md bg-muted text-xs font-bold text-brand-text">{m.tenantName.slice(0, 2).toUpperCase()}</span>
            <span className="flex-1"><span className="block font-semibold">{m.tenantName}</span><span className="text-sm text-muted-foreground">Your store&apos;s console · {ROLE_LABEL[m.role]}</span></span>
          </Link>
        ))}
        <p className="text-sm text-muted-foreground">You can switch at any time: Admin links to your store, and your store&apos;s menu links back to Admin.</p>
      </div>
    </main>
  )
}

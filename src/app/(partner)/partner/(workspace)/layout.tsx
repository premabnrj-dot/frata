import { railFrom } from '@/components/shell/rail'
import type { Build } from '@/lib/db/platform'
import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AppShell, type Place } from '@/components/shell/app-shell'
import type { NavItem } from '@/components/shell/nav'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { partnerCan } from '@/domains/partners/team'
import { requirePartner } from '@/lib/auth/require-partner'
import { accessOf } from '@/lib/auth/session'
import { BUILDER_LABEL, ROLE_LABEL, type MemberRole } from '@/domains/tenancy/roles'
import { Toaster } from '@/components/ui/toast'
import { Submit } from '@/components/ui/submit'
import { PartnerFrame } from '@/components/passkeys/partner-frame'
import { PartnerGate } from '@/components/passkeys/partner-gate'
import { CheckTimer } from '@/components/passkeys/check-timer'
import { gateState } from '@/lib/db/partner-passkeys'
import { partnerReturnPath, returnLabel } from '@/domains/partners/passkeys'
import { signOutAction } from '@/app/(admin)/admin/sign-out/actions'

/** "+91 98450 •••21" (mockup screen 11): the number Frrata will call, its middle hidden. */
const maskPhone = (phone: string) => { const d = phone.replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} •••${d.slice(8)}` : null }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: { template: '%s · Frrata Partners', default: 'Frrata Partners' } }

/**
 * The partner workspace: the console's shell with a PARTNER tag (frata-design-language § Partner workspace).
 * ⚠️ It guards nothing below: every page calls requirePartner itself.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePartner()
  const signOut = <form action={signOutAction}><input type="hidden" name="to" value="partner" /><Submit variant="link">Sign out</Submit></form>
  // Partner passkeys (T1b): no page renders until this browser session has passed the check.
  if (!auth.ok && auth.reason === 'needs_passkey') {
    const state = await gateState(auth.identity).catch(() => 'error' as const)
    if (state === 'error') return <main data-shell data-neel="" className="p-6"><Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel></main>
    const p = auth.identity.partner
    return <Toaster calm><PartnerFrame><PartnerGate state={state} ownerName={(p.name || p.businessName).split(' ')[0] || 'your partner owner'} phone={maskPhone(p.phone)} signOut={signOut} /></PartnerFrame></Toaster>
  }
  // Signed out (mockup screen 16): back to the same page after signing in again.
  if (!auth.ok && auth.reason === 'signed_out') {
    const back = partnerReturnPath((await headers()).get('x-frrata-path'))
    const hadSession = (await cookies()).getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
    return (
      <PartnerFrame>
        <h1 className="font-display text-title font-semibold">{hadSession ? 'You’ve been signed out' : 'Sign in'}</h1>
        {back !== '/partner' && <p className="text-sm text-muted-foreground">Back to {returnLabel(back)}</p>}
        <Link href={`/partner/sign-in?next=${encodeURIComponent(back)}`} className={button({ size: 'lg' })}>{hadSession ? 'Sign in again' : 'Sign in'}</Link>
      </PartnerFrame>
    )
  }
  if (!auth.ok) {
    return (
      <main data-shell data-neel="" className="p-6">
        <Panel title={auth.reason === 'in_review' ? 'Your application is in review' : auth.reason === 'signed_out' ? 'Sign in to continue' : auth.reason === 'suspended' ? auth.message : 'This email is not a Frrata partner'}
          action={<Link href={auth.reason === 'signed_out' ? '/login' : '/partners/apply'} className={button({ variant: 'secondary' })}>{auth.reason === 'signed_out' ? 'Sign in' : 'See your application'}</Link>} />
      </main>
    )
  }
  const access = await accessOf(auth.userId).catch(() => ({ memberships: [] as { tenantId: string; tenantName: string; role: string; supportSessionId: string | null }[], builds: [] as Build[] }))
  const places: Place[] = [
    { href: '/partner', name: 'Partner workspace', role: '', current: true },
    ...access.memberships.filter((m) => !m.supportSessionId).map((m) => ({ href: '/console', name: m.tenantName, role: ROLE_LABEL[m.role as MemberRole] ?? m.role, current: false, tenantId: m.tenantId })),
    ...access.builds.map((b) => ({ href: '/console', name: b.tenantName, role: BUILDER_LABEL, current: false, tenantId: b.tenantId })),
  ]
  const clients: NavItem = { href: '/partner', label: 'Clients', icon: 'merchants', exact: true }
  const details: NavItem = { href: '/partner/details', label: 'Your details', icon: 'details' }
  // The team is the owner's (T1a); a lead sees Clients and their details only.
  const team: NavItem = { href: '/partner/team', label: 'Team', icon: 'staff' }
  const can = (what: Parameters<typeof partnerCan>[1]) => partnerCan(auth.partner.memberRole, what)
  // Everyone's own passkeys (T1b; mockup screen 18).
  const passkeys: NavItem = { href: '/partner/passkeys', label: 'Passkeys', icon: 'key' }
  // Everyone's own computers (G·3; four screens § 2): a Builder's page says who may sign one in. The phone bar is four
  // cells (nav.tsx): three places and More; Developer and anything past three sit in More.
  const developer: NavItem = { href: '/partner/developer', label: 'Developer', icon: 'code' }
  const items = [clients, ...(can('manageTeam') ? [team] : []), passkeys, developer, ...(can('seeDetails') ? [details] : [])]
  const bar = items.filter((i) => i !== developer)
  const name = auth.partner.businessName || auth.partner.name
  return (
    <AppShell rail={railFrom((await cookies()).get('rail')?.value)} title={name} tag="PARTNER" navLabel="Partner" groups={[{ label: '', items }]} tabs={bar.slice(0, 3)} more={[...bar.slice(3), developer]} foot={[]}
      email={auth.email} places={places} signOutTo="partner">
      <CheckTimer confirmedAt={auth.confirmedAt.toISOString()} signOut={<form action={signOutAction}><input type="hidden" name="to" value="partner" /><Submit variant="secondary">Sign out</Submit></form>} />
      {children}
    </AppShell>
  )
}

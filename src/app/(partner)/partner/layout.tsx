import Link from 'next/link'
import type { Metadata } from 'next'
import { AppShell, type Place } from '@/components/shell/app-shell'
import type { NavItem } from '@/components/shell/nav'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { requirePartner } from '@/lib/auth/require-partner'
import { accessOf } from '@/lib/auth/session'
import { ROLE_LABEL, type MemberRole } from '@/domains/tenancy/roles'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: { template: '%s · Frrata Partners', default: 'Frrata Partners' } }

/**
 * The partner workspace: the console's shell with a PARTNER tag (frata-design-language § Partner workspace).
 * ⚠️ It guards nothing below: every page calls requirePartner itself.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePartner()
  if (!auth.ok) {
    return (
      <main data-shell className="p-6">
        <Panel title={auth.reason === 'in_review' ? 'Your application is in review' : auth.reason === 'signed_out' ? 'Sign in to continue' : auth.reason === 'suspended' ? auth.message : 'This email is not a Frrata partner'}
          action={<Link href={auth.reason === 'signed_out' ? '/login' : '/partners/apply'} className={button({ variant: 'secondary' })}>{auth.reason === 'signed_out' ? 'Sign in' : 'See your application'}</Link>} />
      </main>
    )
  }
  const access = await accessOf(auth.userId).catch(() => ({ memberships: [] as { tenantId: string; tenantName: string; role: string; supportSessionId: string | null }[] }))
  const places: Place[] = [
    { href: '/partner', name: 'Partner workspace', role: '', current: true },
    ...access.memberships.filter((m) => !m.supportSessionId).map((m) => ({ href: '/console', name: m.tenantName, role: ROLE_LABEL[m.role as MemberRole] ?? m.role, current: false, tenantId: m.tenantId })),
  ]
  const clients: NavItem = { href: '/partner', label: 'Clients', icon: 'merchants', exact: true }
  const details: NavItem = { href: '/partner/details', label: 'Your details', icon: 'details' }
  // The team is the owner's (T1a); a lead sees Clients and their details only.
  const team: NavItem = { href: '/partner/team', label: 'Team', icon: 'staff' }
  const items = auth.partner.memberRole === 'owner' ? [clients, team, details] : [clients, details]
  const name = auth.partner.businessName || auth.partner.name
  return (
    <AppShell title={name} tag="PARTNER" navLabel="Partner" groups={[{ label: '', items }]} tabs={items} more={[]} foot={[]}
      email={auth.email} places={places}>
      {children}
    </AppShell>
  )
}

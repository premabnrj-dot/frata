import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { SupportBanner } from '@/components/nav/support-banner'
import { AppShell } from '@/components/shell/app-shell'
import { NavPill, type NavGroup, type NavItem } from '@/components/shell/nav'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { BillingBanner } from './_components/billing-banner'
import { toConfirmCount } from '@/lib/queries/orders'
import { supportVisit } from '@/lib/queries/support'
import { TenantCheck } from '@/components/shell/tenant-check'
import type { Place } from '@/components/shell/app-shell'
import { BuildingBanner } from '@/components/nav/building-banner'
import { myPartner, partnerClients } from '@/lib/db/partners'
import { clientStage } from '@/domains/partners/stage'
import { CONSOLE_ROLES, ROLE_LABEL } from '@/domains/tenancy/roles'

export const dynamic = 'force-dynamic'

/** Tab titles "Orders · Kesar Studio" (rule 11): each page sets a plain title. */
export async function generateMetadata(): Promise<Metadata> {
  const auth = await requireMember(CONSOLE_ROLES)
  const shop = auth.ok ? auth.membership.tenantName : 'Frrata'
  return { title: { template: `%s · ${shop}`, default: shop } }
}

/** The To confirm pill (U·2a): its own light count, streamed, so the shell never waits for it; no pill on failure. */
async function ToConfirmPill({ tenantId }: { tenantId: string }) {
  const n = await toConfirmCount(tenantId).catch((err) => { console.error('[nav count]', err instanceof Error ? err.name : err); return 0 })
  return <NavPill n={n} label="to confirm" />
}

/**
 * The shell, and the refusal panel. A refusal renders a panel rather than
 * redirecting: redirecting from a layout breaks the App Router (frata-gotchas).
 * ⚠️ This check does NOT protect the pages under it — they render in parallel.
 * Every page calls requireMember itself.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // The accountant opens the console too (GST plan phase 3) and sees GST only; every page still checks its own roles.
  const auth = await requireMember(CONSOLE_ROLES)
  if (!auth.ok && auth.reason === 'not_configured') {
    return (
      <main data-shell className="p-6">
        <Panel title={auth.message}>
          Set the Supabase and database variables listed in <code>.env.example</code> in Vercel, then redeploy.
        </Panel>
      </main>
    )
  }
  if (!auth.ok) {
    return (
      <main data-shell className="p-6">
        <Panel title={auth.reason === 'signed_out' ? 'Sign in to continue' : 'No store on this account'}
          action={auth.reason === 'no_access'
            ? <div className="flex flex-wrap justify-center gap-2"><Link href="/start" className={button()}>Start your shop</Link><Link href="/login" className={button({ variant: 'secondary' })}>Sign in with another email</Link></div>
            : <Link href="/login" className={button({ variant: 'secondary' })}>Sign in</Link>}>
          {auth.reason === 'no_access' && 'This email has no shop yet. Start one, or ask a shop’s owner to invite you.'}
        </Panel>
      </main>
    )
  }
  const now = new Date()
  const { tenantId, tenantName, supportSessionId, role } = auth.membership
  const visit = supportSessionId ? await supportVisit(tenantId, supportSessionId) : null
  // A partner in a store with no owner yet: the building banner and Hand over (approved mockup screen 7).
  const logged = <T,>(fallback: T) => (err: unknown) => { console.error('[console layout] partner', err instanceof Error ? err.name : err); return fallback }
  const partner = role === 'partner' ? await myPartner(auth.userId).catch(logged(null)) : null
  const client = partner ? (await partnerClients(auth.userId).catch(logged([]))).find((c) => c.tenantId === tenantId) : undefined
  // The stage is clientStage's, the one home (src/domains/partners/stage.ts): the banner shows while there is no owner.
  const stage = client ? clientStage({ removedAt: client.removedAt, openInviteExpiresAt: client.inviteExpiresAt, hasOwner: !!client.ownerEmail, firstOpenedAt: client.firstOpenedAt }, now) : null
  const building = client && (stage === 'building' || stage === 'invited') ? client : null
  const places: Place[] = [
    ...(partner?.approvedAt ? [{ href: '/partner', name: 'Partner workspace', role: '', current: false }] : []),
    ...auth.all.filter((m) => !m.supportSessionId).map((m) => ({ href: '/console', name: m.tenantName, role: ROLE_LABEL[m.role], current: m.tenantId === tenantId, tenantId: m.tenantId })),
  ]
  const pill = <Suspense fallback={null}><ToConfirmPill tenantId={tenantId} /></Suspense>
  const home: NavItem = { href: '/console', label: 'Home', icon: 'home', exact: true }
  const orders: NavItem = { href: '/console/orders', label: 'Orders', icon: 'orders', badge: pill }
  const products: NavItem = { href: '/console/products', label: 'Products', icon: 'products' }
  const collections: NavItem = { href: '/console/collections', label: 'Collections', icon: 'collections' }
  const settings: NavItem = { href: '/console/settings', label: 'Settings', icon: 'settings' }
  const offers: NavItem = { href: '/console/offers', label: 'Offers', icon: 'offers' }
  const look: NavItem = { href: '/console/look', label: 'Look', icon: 'look' }
  const apps: NavItem = { href: '/console/apps', label: 'Apps', icon: 'apps' }
  const analytics: NavItem = { href: '/console/analytics', label: 'Analytics', icon: 'profit' }
  const activity: NavItem = { href: '/console/activity', label: 'Activity', icon: 'activity' }
  const search: NavItem = { href: '/console/search', label: 'Search and sharing', icon: 'search' }
  const gst: NavItem = { href: '/console/apps/gst', label: 'GST', icon: 'tax' }
  // GST is a module (Growth and Scale, switched on in Apps): owners and admins open it from Apps (its Set up link shows
  // once it is on), so the layout reads nothing more per page. The accountant's console is GST alone.
  const accountant = role === 'accountant'
  const groups: NavGroup[] = accountant ? [{ label: 'Taxes', items: [gst] }]
    : [{ label: 'Today', items: [home, orders, analytics] }, { label: 'Catalogue', items: [products, collections] }, { label: 'Store', items: [offers, look, search, apps, settings, activity] }]
  const foot: NavItem[] = [{ href: '/console/preview', label: 'Preview shop', icon: 'external' }]
  if (auth.staffRole !== null && !supportSessionId) foot.push({ href: '/admin', label: 'Frrata Admin', icon: 'admin' })
  return (
    <AppShell title={tenantName} navLabel="Console" groups={groups} tabs={accountant ? [gst] : [home, orders, products]} more={accountant ? [] : [analytics, collections, offers, look, search, apps, settings, activity]} foot={accountant ? [] : foot}
      email={auth.email} tenantId={tenantId} places={places}
      banner={visit ? <SupportBanner storeName={tenantName} visit={visit} now={now} />
        : building ? <BuildingBanner shop={tenantName} inviteEmail={building.inviteEmail} /> : undefined}>
      {/* Anyone who can be in two places checks which shop each page is for (tenancy audit 2026-11-07). */}
      <TenantCheck tenantId={tenantId} staff={auth.staffRole !== null || places.length > 1} />
      {/* Billing B3: a failed payment to Frrata, for owners and admins (never on a support visit, never a block). */}
      {!supportSessionId && (role === 'owner' || role === 'admin') && <Suspense fallback={null}><BillingBanner membership={auth.membership} /></Suspense>}
      {children}
    </AppShell>
  )
}

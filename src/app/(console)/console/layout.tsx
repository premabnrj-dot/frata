import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { SupportBanner } from '@/components/nav/support-banner'
import { AppShell } from '@/components/shell/app-shell'
import { NavPill, type NavGroup, type NavItem } from '@/components/shell/nav'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { BillingBanner } from './_components/billing-banner'
import { DomainBanner } from './_components/domain-banner'
import { navCounts } from '@/lib/queries/orders'
import { supportVisit } from '@/lib/queries/support'
import { TenantCheck } from '@/components/shell/tenant-check'
import type { Place } from '@/components/shell/app-shell'
import { BuildingBanner } from '@/components/nav/building-banner'
import { myPartner, partnerClients } from '@/lib/db/partners'
import { clientStage } from '@/domains/partners/stage'
import { MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { shopModules } from '@/lib/queries/modules'
import { MODULE_ICON } from '@/components/modules/icons'
import { CONSOLE_ROLES, ROLE_LABEL } from '@/domains/tenancy/roles'
import { partnerCan } from '@/domains/partners/team'

export const dynamic = 'force-dynamic'

/** Tab titles "Orders · Kesar Studio" (rule 11): each page sets a plain title. */
export async function generateMetadata(): Promise<Metadata> {
  const auth = await requireMember(CONSOLE_ROLES)
  const shop = auth.ok ? auth.membership.tenantName : 'Frrata'
  return { title: { template: `%s · ${shop}`, default: shop } }
}

/** The nav's counts (U·2a; email E·1): orders to confirm and unread notices, from ONE cached read (navCounts),
 *  streamed so the shell never waits; no pill on failure. */
async function NavCount({ tenantId, userId, which }: { tenantId: string; userId: string; which: 'toConfirm' | 'unread' | 'address' }) {
  const c = await navCounts(tenantId, userId).catch((err) => { console.error('[nav count]', err instanceof Error ? err.name : err); return null })
  if (which === 'address') return c?.address ?? null
  const n = c?.[which] ?? 0
  return which === 'toConfirm' ? <NavPill n={n} label="to confirm" /> : <NavPill n={n} label="unread notices" max={9} />
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
      <main data-shell data-neel="" className="p-6">
        <Panel title={auth.message}>
          Set the Supabase and database variables listed in <code>.env.example</code> in Vercel, then redeploy.
        </Panel>
      </main>
    )
  }
  if (!auth.ok) {
    return (
      <main data-shell data-neel="" className="p-6">
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
  // Hand over is the owner's (PARTNER_CAN.handOver): a lead builds the store and sees no banner.
  const building = client && partner && partnerCan(partner.memberRole, 'handOver') && (stage === 'building' || stage === 'invited') ? client : null
  const places: Place[] = [
    ...(partner?.approvedAt ? [{ href: '/partner', name: 'Partner workspace', role: '', current: false }] : []),
    ...auth.all.filter((m) => !m.supportSessionId).map((m) => ({ href: '/console', name: m.tenantName, role: ROLE_LABEL[m.role], current: m.tenantId === tenantId, tenantId: m.tenantId })),
  ]
  const pill = <Suspense fallback={null}><NavCount tenantId={tenantId} userId={auth.userId} which="toConfirm" /></Suspense>
  const bell = <Suspense fallback={null}><NavCount tenantId={tenantId} userId={auth.userId} which="unread" /></Suspense>
  const address = <Suspense fallback={null}><NavCount tenantId={tenantId} userId={auth.userId} which="address" /></Suspense>
  const rail = (await cookies()).get('rail')?.value === '1'
  const home: NavItem = { href: '/console', label: 'Home', icon: 'home', exact: true }
  const orders: NavItem = { href: '/console/orders', label: 'Orders', icon: 'orders', badge: pill }
  const products: NavItem = { href: '/console/products', label: 'Products', icon: 'products' }
  const collections: NavItem = { href: '/console/collections', label: 'Collections', icon: 'collections' }
  const settings: NavItem = { href: '/console/settings', label: 'Settings', icon: 'settings' }
  const offers: NavItem = { href: '/console/offers', label: 'Offers', icon: 'offers' }
  const look: NavItem = { href: '/console/look', label: 'Look', icon: 'look' }
  // The shop's apps in use, under Apps (those with a page of their own); shopModules is per-request cached, and a
  // failure only leaves Apps without its list.
  const mods = await shopModules(tenantId, now.toISOString()).catch((err) => { console.error('[console layout] apps', err instanceof Error ? err.name : err); return null })
  const inUse: NavItem[] = mods ? MODULE_KEYS.flatMap((k) => {
    const page = MODULES[k].setup
    return page && mods.access[k].on && mods.access[k].usable ? [{ href: page, label: MODULES[k].name, icon: MODULE_ICON[k] }] : []
  }) : []
  const apps: NavItem = { href: '/console/apps', label: 'Apps', icon: 'apps', children: inUse }
  const analytics: NavItem = { href: '/console/analytics', label: 'Analytics', icon: 'profit' }
  const activity: NavItem = { href: '/console/activity', label: 'Activity', icon: 'activity' }
  const noticesItem: NavItem = { href: '/console/notices', label: 'Notices', icon: 'bell', badge: bell }
  const search: NavItem = { href: '/console/search', label: 'Search and sharing', icon: 'search' }
  const gst: NavItem = { href: '/console/apps/gst', label: 'GST', icon: 'tax' }
  // GST is a module (Growth and Scale, switched on in Apps): owners and admins open it from Apps (its card leads to its
  // page), so the layout reads nothing more per page. The accountant's console is GST alone.
  const accountant = role === 'accountant'
  const groups: NavGroup[] = accountant ? [{ label: 'Taxes', items: [gst] }]
    : [{ label: 'Today', items: [home, orders, noticesItem, analytics] }, { label: 'Catalogue', items: [products, collections] }, { label: 'Store', items: [offers, look, search, apps, settings, activity] }]
  const foot: NavItem[] = [{ href: '/console/preview', label: 'Preview shop', icon: 'external' }]
  if (auth.staffRole !== null && !supportSessionId) foot.push({ href: '/admin', label: 'Frrata Admin', icon: 'admin' })
  return (
    <AppShell title={tenantName} navLabel="Console" groups={groups} tabs={accountant ? [gst] : [home, orders, products]} more={accountant ? [] : [noticesItem, analytics, collections, offers, look, search, apps, settings, activity]} foot={accountant ? [] : foot}
      email={auth.email} tenantId={tenantId} places={places} subtitle={address} rail={rail}
      banner={visit ? <SupportBanner storeName={tenantName} visit={visit} now={now} />
        : building ? <BuildingBanner shop={tenantName} inviteEmail={building.inviteEmail} /> : undefined}>
      {/* Anyone who can be in two places checks which shop each page is for (tenancy audit 2026-11-07). */}
      <TenantCheck tenantId={tenantId} staff={auth.staffRole !== null || places.length > 1} />
      {/* Billing B3: a failed payment to Frrata, for owners and admins (never on a support visit, never a block). */}
      {!supportSessionId && (role === 'owner' || role === 'admin') && <Suspense fallback={null}><BillingBanner membership={auth.membership} /></Suspense>}
      {/* Own domains: a main domain failing for 24 h (design rule 76). */}
      {!supportSessionId && (role === 'owner' || role === 'admin') && <Suspense fallback={null}><DomainBanner membership={auth.membership} /></Suspense>}
      {children}
    </AppShell>
  )
}

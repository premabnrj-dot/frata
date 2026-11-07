import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { SupportBanner } from '@/components/nav/support-banner'
import { AppShell } from '@/components/shell/app-shell'
import { NavPill, type NavGroup, type NavItem } from '@/components/shell/nav'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { toConfirmCount } from '@/lib/queries/orders'
import { supportVisit } from '@/lib/queries/support'
import { TenantCheck } from '@/components/shell/tenant-check'

export const dynamic = 'force-dynamic'

/** Tab titles "Orders · Kesar Studio" (rule 11): each page sets a plain title. */
export async function generateMetadata(): Promise<Metadata> {
  const auth = await requireMember(ANY_MEMBER)
  const shop = auth.ok ? auth.membership.tenantName : 'Frata'
  return { title: { template: `%s · ${shop}`, default: shop } }
}

/** The To confirm pill (U·2a): its own light count, streamed, so the shell never waits for it; no pill on failure. */
async function ToConfirmPill({ tenantId }: { tenantId: string }) {
  const n = await toConfirmCount(tenantId).catch((err) => { console.error('[nav count]', err instanceof Error ? err.name : err); return 0 })
  return <NavPill n={n} label="To confirm" />
}

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
  const { tenantId, tenantName, supportSessionId } = auth.membership
  const visit = supportSessionId ? await supportVisit(tenantId, supportSessionId) : null
  const pill = <Suspense fallback={null}><ToConfirmPill tenantId={tenantId} /></Suspense>
  const home: NavItem = { href: '/console', label: 'Home', icon: 'home', exact: true }
  const orders: NavItem = { href: '/console/orders', label: 'Orders', icon: 'orders', badge: pill }
  const products: NavItem = { href: '/console/products', label: 'Products', icon: 'products' }
  const collections: NavItem = { href: '/console/collections', label: 'Collections', icon: 'collections' }
  const settings: NavItem = { href: '/console/settings', label: 'Settings', icon: 'settings' }
  const activity: NavItem = { href: '/console/activity', label: 'Activity', icon: 'activity' }
  const groups: NavGroup[] = [{ label: 'Today', items: [home, orders] }, { label: 'Catalogue', items: [products, collections] }, { label: 'Store', items: [settings, activity] }]
  const foot: NavItem[] = [{ href: '/console/preview', label: 'Preview shop', icon: 'external' }]
  if (auth.staffRole !== null && !supportSessionId) foot.push({ href: '/admin', label: 'Frata Admin', icon: 'admin' })
  return (
    <AppShell title={tenantName} navLabel="Console" groups={groups} tabs={[home, orders, products]} more={[collections, settings, activity]} foot={foot}
      email={auth.email} tenantId={tenantId} banner={visit ? <SupportBanner storeName={tenantName} visit={visit} now={now} /> : undefined}>
      <TenantCheck tenantId={tenantId} staff={auth.staffRole !== null} />
      {children}
    </AppShell>
  )
}

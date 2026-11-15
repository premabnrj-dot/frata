import { AppShell, type Place } from '@/components/shell/app-shell'
import type { NavItem } from '@/components/shell/nav'
import { TenantCheck } from '@/components/shell/tenant-check'
import { BUILDER_LABEL, ROLE_LABEL } from '@/domains/tenancy/roles'
import { navOf, type BuilderNav } from '@/lib/auth/require-capability'
import type { RailChoice } from '@/components/shell/rail'

/**
 * A partner's Builder's console (T1c; approved mockup screens 7–11): the same AppShell, holding only what a Builder's
 * capabilities open — Catalogue › Products, Collections; Preview store; the way back to the partner workspace. No
 * counts, apps, banners or notices are read for a Builder (each would read orders or settings). Hiding these is not the
 * lock: every page asks requireCapability or requireMember itself, and frata_builder holds no other grant.
 */
export function BuilderShell({ nav, email, rail, children }: { nav: BuilderNav; email: string | null; rail: RailChoice; children: React.ReactNode }) {
  const { current: store, all, builds } = navOf(nav)
  const products: NavItem = { href: '/console/products', label: 'Products', icon: 'products' }
  const collections: NavItem = { href: '/console/collections', label: 'Collections', icon: 'collections' }
  const preview: NavItem = { href: '/console/preview', label: 'Preview store', icon: 'external' }
  const previewTab: NavItem = { ...preview, label: 'Preview' }
  const places: Place[] = [
    { href: '/partner', name: 'Partner workspace', role: '', current: false },
    ...all.filter((m) => !m.supportSessionId).map((m) => ({ href: '/console', name: m.tenantName, role: ROLE_LABEL[m.role], current: false, tenantId: m.tenantId })),
    ...builds.map((b) => ({ href: '/console', name: b.tenantName, role: BUILDER_LABEL, current: b.tenantId === store.tenantId, tenantId: b.tenantId })),
  ]
  return (
    <AppShell title={store.tenantName} navLabel="Console" groups={[{ label: 'Catalogue', items: [products, collections] }]}
      tabs={[products, collections, previewTab]} more={[]} foot={[preview, { href: '/partner', label: 'Partner workspace', icon: 'partners' }]}
      email={email ? `${email} · ${BUILDER_LABEL}` : null} tenantId={store.tenantId} places={places} rail={rail}>
      <TenantCheck tenantId={store.tenantId} staff={places.length > 2} />
      {children}
    </AppShell>
  )
}

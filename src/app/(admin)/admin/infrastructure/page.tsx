import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { countFor, supabaseAlerts, type Tab } from '@/domains/infra/alerts'
import { dbHealth } from '@/lib/admin/infra'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { SupabaseTab } from './_components/supabase-tab'

// =============================================================================
// Admin › Infrastructure (plan docs/plans/2026-11-11-guardrails-infra-a2.md I·4; mockup
// docs/mockups/2026-11-10-infra-usage.html, approved by the owner's "build … along with admin infrastructure",
// 2026-11-11). Staff only. Three tabs; each works on its own, and one that isn't connected says what it needs.
// =============================================================================

export const metadata = { title: 'Infrastructure' }

const TABS: [Tab, string][] = [['vercel', 'Vercel'], ['mux', 'Mux'], ['supabase', 'Supabase']]

export default async function InfrastructurePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? sp.tab as Tab : 'supabase'
  const health = await dbHealth(staff)
  const alerts = health ? supabaseAlerts(health) : []
  return (
    <>
      <PageHeader title="Infrastructure" />
      <ViewTabs label="Service" tabs={TABS.map(([t, label]) => ({ href: `/admin/infrastructure?tab=${t}`, label, count: countFor(alerts, t) || undefined, current: t === tab }))} />
      {tab === 'supabase' ? <SupabaseTab h={health} alerts={alerts.filter((a) => a.tab === 'supabase')} />
        : tab === 'vercel' ? <Panel title="Vercel’s numbers arrive with its billing read">A billing-only Vercel token connects this tab. Vercel’s own spend alerts by email and SMS hold until then.</Panel>
        : <Panel title="Mux’s numbers arrive with its usage read">A read-only Mux token connects this tab. Mux’s own spending alerts by email hold until then.</Panel>}
    </>
  )
}

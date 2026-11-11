import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { countFor, supabaseAlerts, type Tab } from '@/domains/infra/alerts'
import { vercelAlerts, vercelFacts } from '@/domains/infra/vercel'
import { dbHealth, lastPulls, usageRows } from '@/lib/admin/infra'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { isVercelBillingConfigured } from '@/lib/env'
import { SupabaseTab } from './_components/supabase-tab'
import { VercelTab } from './_components/vercel-tab'

// =============================================================================
// Admin › Infrastructure (plan docs/plans/2026-11-11-guardrails-infra-a2.md I·4; mockup
// docs/mockups/2026-11-10-infra-usage.html, approved by the owner's "build … along with admin infrastructure",
// 2026-11-11). Staff only. Three tabs; each works on its own, and one that isn't connected says what it needs.
// Alerts are derived on each visit (no stored alert state).
// =============================================================================

export const metadata = { title: 'Infrastructure' }

const TABS: [Tab, string][] = [['vercel', 'Vercel'], ['mux', 'Mux'], ['supabase', 'Supabase']]

export default async function InfrastructurePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const now = new Date()
  // From a week before the month: the spike rule compares a day with the 7 before it.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 86_400_000).toISOString().slice(0, 10)
  const [health, rows, pulls] = await Promise.all([dbHealth(staff), usageRows('vercel', from).catch(() => []), lastPulls('vercel').catch(() => ({ last: null, lastOk: null }))])
  const vf = vercelFacts(rows, now)
  const alerts = [...(pulls.lastOk ? vercelAlerts(vf) : []), ...(health ? supabaseAlerts(health) : [])]
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? sp.tab as Tab : 'vercel'
  return (
    <>
      <PageHeader title="Infrastructure" />
      <ViewTabs label="Service" tabs={TABS.map(([t, label]) => ({ href: `/admin/infrastructure?tab=${t}`, label, count: countFor(alerts, t) || undefined, current: t === tab }))} />
      {tab === 'supabase' ? <SupabaseTab h={health} alerts={alerts.filter((a) => a.tab === 'supabase')} />
        : tab === 'vercel' ? <VercelTab f={vf} alerts={alerts.filter((a) => a.tab === 'vercel')} pulls={pulls} connected={isVercelBillingConfigured()} />
        : <Panel title="Mux’s numbers arrive with its usage read">A read-only Mux token connects this tab. Mux’s own spending alerts by email hold until then.</Panel>}
    </>
  )
}

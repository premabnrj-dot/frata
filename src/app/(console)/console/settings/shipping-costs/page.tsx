import { Panel } from '@/components/ui/panel'
import { requireMember } from '@/lib/auth/require-member'
import { CAN_SET_COSTS } from '@/domains/tenancy/roles'
import { dayIN } from '@/lib/format-date'
import { shipCostsSeenBy } from '@/lib/queries/settings'
import { ShipCostsForm } from './ship-costs-form'

// =============================================================================
// FILE: src/app/(console)/console/settings/shipping-costs/page.tsx
//
// SETTINGS › SHIPPING COSTS (Ship S·0, owner call S3): what a delivery, a return and a COD fee cost when the shop
// ships another way. A merchant's cost (ADR-0003), never in ShopFacts: owners and admins, and a partner before
// handover (seesCosts; owner 2026-11-08); never staff.
// Until they are confirmed, profit on those orders says "before shipping costs"; after, "estimated".
// =============================================================================

export const metadata = { title: 'Shipping costs' }

export default async function ShippingCostsPage() {
  const auth = await requireMember(CAN_SET_COSTS)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or an admin can see shipping costs' : auth.message} />
  // The error's name only: a failed query's message carries its parameters (tenancy audit 2026-11-08).
  const r = await shipCostsSeenBy(auth.membership.tenantId, auth.membership.role).catch((err) => { console.error('[shipping-costs]', err instanceof Error ? err.name : 'error'); return undefined })
  if (r === undefined) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  // A partner after handover (seesCosts): the shop's costs are its owner's now.
  if (!r.visible) return <Panel title="Only the owner or an admin can see shipping costs">The shop’s owner sets these now.</Panel>
  const c = r.costs
  const rupees = (p: number | null | undefined) => (p == null ? null : String(Math.round(p / 100)))
  return <ShipCostsForm current={{ delivery: rupees(c?.delivery), ret: rupees(c?.ret), cod: rupees(c?.cod) }} confirmedOn={c?.confirmedAt ? dayIN(c.confirmedAt) : null} />
}

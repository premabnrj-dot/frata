import { Panel } from '@/components/ui/panel'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { dayIN } from '@/lib/format-date'
import { shipCostsFor } from '@/lib/queries/settings'
import { ShipCostsForm } from './ship-costs-form'

// =============================================================================
// FILE: src/app/(console)/console/settings/shipping-costs/page.tsx
//
// SETTINGS › SHIPPING COSTS (Ship S·0, owner call S3): what a delivery, a return and a COD fee cost when the shop
// ships another way. Owners and admins only: a merchant's cost (ADR-0003), never in ShopFacts, never to staff.
// Until they are confirmed, profit on those orders says "before shipping costs"; after, "estimated".
// =============================================================================

export const metadata = { title: 'Shipping costs' }

export default async function ShippingCostsPage() {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or an admin can see shipping costs' : auth.message} />
  const c = await shipCostsFor(auth.membership.tenantId).catch((err) => { console.error('[shipping-costs]', err); return undefined })
  if (c === undefined) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const rupees = (p: number | null | undefined) => (p == null ? null : String(Math.round(p / 100)))
  return <ShipCostsForm current={{ delivery: rupees(c?.delivery), ret: rupees(c?.ret), cod: rupees(c?.cod) }} confirmedOn={c?.confirmedAt ? dayIN(c.confirmedAt) : null} />
}

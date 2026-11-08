import Link from 'next/link'
import { Money } from '@/components/data/numeric'
import { paise } from '@/domains/money/paise'
import type { Membership } from '@/lib/db/platform'
import { billingBanner } from '@/lib/queries/billing'

/**
 * A failed payment to Frrata, or the day-14 note, on every console page — for owners and admins only (billing B3;
 * spec § Design). It never blocks anything: the shop, its checkout and its orders keep working.
 */
export async function BillingBanner({ membership }: { membership: Pick<Membership, 'tenantId' | 'role'> }) {
  const b = await billingBanner(membership).catch(() => null)
  if (!b) return null
  return (
    <div role="status" className="mb-3 rounded-md border border-warn-text/30 bg-warn px-3 py-2 text-sm text-warn-text">
      {b.kind === 'failed'
        ? <>Your payment of <Money paise={paise(b.amount)} decimals /> for Frrata invoice {b.number} didn&apos;t go through. Your shop keeps working. </>
        : <>Frrata invoice {b.number} still has <Money paise={paise(b.amount)} decimals /> due. Your shop keeps working; please pay when you can. </>}
      <Link href="/console/settings/billing" className="font-medium underline">Pay now</Link>
    </div>
  )
}

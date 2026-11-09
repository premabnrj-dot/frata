import Link from 'next/link'
import type { Membership } from '@/lib/db/platform'
import { dayMonthIN } from '@/lib/format-date'
import { failingMainFor } from '@/lib/queries/addresses'

/**
 * Own domains (design rule 76): the shop's main domain has failed its checks for 24 h — on every console page, for owners
 * and admins. Shoppers already go to the frrata name meanwhile (mainDomainIn skips a failing domain); one way on.
 */
export async function DomainBanner({ membership }: { membership: Pick<Membership, 'tenantId'> }) {
  const now = new Date() // clock-ok: a server component, rendered per request
  const f = await failingMainFor(membership.tenantId, now).catch(() => null)
  if (!f) return null
  return (
    <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-text/30 bg-danger px-3 py-2 text-sm text-danger-text">
      <span><span className="font-mono">{f.host}</span> not working since {dayMonthIN(f.since)} · shoppers go to <span className="font-mono">{f.nameHost}</span></span>
      <Link href="/console/settings/address" className="font-medium underline">Fix it</Link>
    </div>
  )
}

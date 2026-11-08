import Link from 'next/link'
import { Money } from '@/components/data/numeric'
import { paise } from '@/domains/money/paise'
import type { Membership } from '@/lib/db/platform'
import { billingBanner, shopTrial } from '@/lib/queries/billing'
import { pausedAt, shopPauseFor } from '@/lib/queries/trial-pause'
import { dayMonthIN } from '@/lib/format-date'
import { formatInr } from '@/lib/format'
import { TrialEnding } from './trial-ending'

/** Frrata's billing and trial notes on every console page — owners and admins only (billing B3; trials TR1·7). */
export async function BillingBanner({ membership }: { membership: Pick<Membership, 'tenantId' | 'role'> }) {
  const [b, t, w] = await Promise.all([billingBanner(membership).catch(() => null), shopTrial(membership).catch(() => null), shopPauseFor(membership).catch(() => null)])
  const now = new Date() // clock-ok: a server component, rendered per request
  // The pause, as shoppers meet it (one window for the shop, checkout and billing): paused, or within its 7 days.
  const paused = pausedAt(w, now)
  const soon = !paused && !!w && !w.to && w.from.getTime() - now.getTime() <= 7 * 86_400_000
  // One banner, in order: a failed payment, paused or about to pause, a trial ending, the day-14 note, the trial line.
  if (b?.kind === 'failed') return <Due kind="failed" amount={b.amount} number={b.number} />
  if (w && (paused || soon)) return (
    <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger-text/30 bg-danger px-3 py-2 text-sm text-danger-text">
      <span>{paused ? 'Shop paused · no new orders' : `${t?.state === 'grace' ? 'Trial ended' : 'Autopay stopped'} · shop pauses ${dayMonthIN(w.from)}`}</span>
      <Link href="/console/settings/billing#paying" className="font-medium underline">Set up autopay</Link>
    </div>
  )
  if (t?.state === 'ending') return <TrialEnding lastDay={dayMonthIN(t.lastDay)} price={formatInr(paise(t.priceWithGst))} dismissKey={`trial-ending:${t.lastDay.toISOString()}`} />
  if (b) return <Due kind={b.kind} amount={b.amount} number={b.number} />
  if (t?.state === 'trial') return <p className="mb-3 text-sm text-muted-foreground"><Link href="/console/settings/billing" className="hover:underline">{t.plan} trial · {t.daysLeft} days left</Link></p>
  return null
}

function Due({ kind, amount, number }: { kind: 'failed' | 'acknowledge'; amount: number; number: string }) {
  return (
    <div role="status" className="mb-3 rounded-md border border-warn-text/30 bg-warn px-3 py-2 text-sm text-warn-text">
      {kind === 'failed' ? <>Payment of <Money paise={paise(amount)} decimals /> for invoice {number} failed. </> : <>Invoice {number}: <Money paise={paise(amount)} decimals /> due. </>}
      <Link href="/console/settings/billing" className="font-medium underline">Pay now</Link>
    </div>
  )
}

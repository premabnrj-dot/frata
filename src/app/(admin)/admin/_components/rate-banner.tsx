import Link from 'next/link'
import { Banner } from '@/components/ui/banner'
import type { RateState } from '@/domains/studio/rate-state'
import { dayMonthIN } from '@/lib/format-date'

// Admin's dollar-rate banner, as drawn (mockup docs/mockups/2026-11-24-v3b-first.html § 1): stopped (no rate, or lapsed)
// and ageing (from the third day: its last working day, then "tomorrow"). A master admin gets Enter rate; Support staff are told
// to ask one.
const day = (key: string) => dayMonthIN(new Date(`${key}T12:00:00+05:30`))
const ASK = 'Ask a master admin to enter today’s dollar rate'

export function RateBanner({ state, admin }: { state: Exclude<RateState, { kind: 'fresh' }>; admin: boolean }) {
  const stopped = state.kind === 'none' || state.kind === 'lapsed'
  const title = stopped ? 'Studio is stopped' : state.kind === 'last' ? 'Studio stops tomorrow' : `Studio stops after ${day(state.lastDay)}`
  const line = !admin ? ASK : state.kind === 'none' ? 'No dollar rate yet' : state.kind === 'lapsed' ? `The newest dollar rate is from ${day(state.newest)}` : 'Enter today’s dollar rate'
  return <Banner tone={stopped ? 'bad' : 'warn'} title={title} action={admin ? <Link href="/admin/rate" className="inline-flex min-h-6 items-center">Enter rate</Link> : undefined}>{line}</Banner>
}

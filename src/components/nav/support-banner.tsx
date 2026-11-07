import Link from 'next/link'
import { SUPPORT_REASON_LABEL, type SupportReason } from '@/domains/support/session'
import { minutesLeft } from '@/domains/support/session'
import { endSupportAction } from '@/app/(admin)/admin/support/end/actions'
import { ExpiryRefresh } from './expiry-refresh'

/**
 * Support mode, above every console page (frata-design-language § Frata Admin; § UX foundation rule 12): whose
 * store, why, time left, back to Admin, end now. Not dismissable. One sticky line (the document keeps the
 * scroll), shorter on phones, where it took 16 % of the screen (stress test S9). When the visit expires the page
 * refreshes, so a kept layout never shows the visited shop after access fell back to the staffer's own (T4).
 */
export function SupportBanner({ storeName, visit, now }: {
  storeName: string
  visit: { reason: string; note: string | null; expiresAt: Date; endedAt: Date | null; tenantId: string }
  now: Date
}) {
  const left = minutesLeft(visit, now)
  const why = `${SUPPORT_REASON_LABEL[visit.reason as SupportReason]}${visit.note ? ` · “${visit.note}”` : ''}`
  return (
    <div role="status" data-support-banner className="sticky top-0 z-40 flex h-[var(--shell-top)] items-center gap-3 bg-support px-4 text-sm text-support-foreground md:px-5 print:hidden">
      <span className="min-w-0 truncate font-semibold" title={why}>
        <span className="md:hidden">Support · </span><span className="hidden md:inline">Frata support in </span>{storeName}<span className="hidden md:inline">&apos;s console</span>
      </span>
      <span className="hidden min-w-0 truncate opacity-90 lg:inline">{why}</span>
      <span className="ml-auto shrink-0 font-mono">{left} min<span className="hidden md:inline"> left</span></span>
      <Link href={`/admin/merchants/${visit.tenantId}`} aria-label="Back to Admin" className="inline-flex min-h-6 shrink-0 items-center font-medium underline">
        <span className="md:hidden">Admin</span><span className="hidden md:inline">Back to Admin</span>
      </Link>
      <form action={endSupportAction} className="shrink-0">
        <button type="submit" aria-label="End now" className="h-8 rounded-md bg-support-foreground px-3 font-semibold text-support">End<span className="hidden md:inline"> now</span></button>
      </form>
      <ExpiryRefresh ms={visit.expiresAt.getTime() - now.getTime()} />
    </div>
  )
}

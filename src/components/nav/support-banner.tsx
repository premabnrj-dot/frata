import Link from 'next/link'
import { SUPPORT_REASON_LABEL, type SupportReason } from '@/domains/support/session'
import { minutesLeft } from '@/domains/support/session'
import { endSupportAction } from '@/app/(admin)/admin/support/end/actions'

/**
 * Support mode, above every console page (frata-design-language § Frata Admin):
 * whose store, why, time left, back to Admin, end now. Not dismissable.
 */
export function SupportBanner({ storeName, visit, now }: {
  storeName: string
  visit: { reason: string; note: string | null; expiresAt: Date; endedAt: Date | null; tenantId: string }
  now: Date
}) {
  const left = minutesLeft(visit, now)
  return (
    <div role="status" data-support-banner className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-warn-text px-4 py-2.5 text-sm text-primary-foreground md:px-5">
      <span className="font-semibold">Frata support in {storeName}&apos;s console</span>
      <span className="opacity-90">{SUPPORT_REASON_LABEL[visit.reason as SupportReason]}{visit.note ? ` · “${visit.note}”` : ''}</span>
      <span className="ml-auto font-mono">{left} min left</span>
      <Link href={`/admin/merchants/${visit.tenantId}`} className="font-medium underline">Back to Admin</Link>
      <form action={endSupportAction}>
        <button type="submit" className="h-8 rounded-md bg-card px-3 font-semibold text-warn-text">End now</button>
      </form>
    </div>
  )
}

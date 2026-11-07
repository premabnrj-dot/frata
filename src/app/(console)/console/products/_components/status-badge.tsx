import { Badge } from '@/components/ui/badge'
import { statusLabel, type Status } from '@/domains/catalogue/availability'

const TONE = { Draft: 'neutral', Active: 'ok', Scheduled: 'info', Unlisted: 'info', Archived: 'neutral' } as const

/** A product's status in words (Scheduled when Active with a moment still to come). */
/** `now` is the page's render time (useNow() in the editor, the page's own in the list): never the browser's clock (check:clock). */
export function StatusBadge({ status, publishAt, now }: { status: string; publishAt: Date | string | null; now: Date }) {
  const label = statusLabel(status as Status, publishAt ? new Date(publishAt) : null, now)
  return <Badge tone={TONE[label as keyof typeof TONE] ?? 'neutral'}>{label}</Badge>
}

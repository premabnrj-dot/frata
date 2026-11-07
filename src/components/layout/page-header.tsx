import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

/** The way back to a list (24 px target, rule 19): the one back link every detail page uses. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-1 inline-flex min-h-6 items-center gap-0.5 rounded-sm pr-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft aria-hidden="true" className="size-4" />{label}
    </Link>
  )
}

/**
 * Every page opens the same way (frata-design-language § UX foundation rule 13), in Console and Admin: an
 * optional way back, the title with its badges, one line of facts, at most one primary action (+ More). A long
 * title wraps; it is never cut mid-word. `titleSlot` replaces the h1's visible text with an editor (the product
 * title field) while the h1 still names the record for a screen reader.
 */
export function PageHeader({ title, actions, back, badges, meta, titleSlot }: {
  title: string
  actions?: ReactNode
  back?: { href: string; label: string }
  badges?: ReactNode
  meta?: ReactNode
  titleSlot?: ReactNode
}) {
  return (
    <div className="space-y-1">
      {back && <BackLink href={back.href} label={back.label} />}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {titleSlot
              ? <><h1 className="sr-only">{title}</h1>{titleSlot}</>
              : <h1 className="min-w-0 text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{title}</h1>}
            {badges}
          </div>
          {meta && <div className="text-sm text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

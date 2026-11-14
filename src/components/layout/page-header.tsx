import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

/** The way back to a list (24 px target, rule 19): the one back link every detail page uses. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-1 inline-flex min-h-6 items-center gap-0.5 rounded-sm pr-1 text-label font-medium text-muted-foreground hover:text-foreground">
      <ChevronLeft aria-hidden="true" className="size-4" />{label}
    </Link>
  )
}

/**
 * Every page opens the same way (Neel § Layout · Header and breadcrumbs), in Console, Admin and the partner workspace:
 * a breadcrumb above when the page sits under a list ("Products › Gulabi kurta"; a phone shows "‹ Products"), the title
 * 22/28 (20/26 on a phone) wrapping to two lines then "…" with the full name on hover, its status chip, a meta line of
 * facts (never a sentence of help), then the actions at the right: More, secondaries, the one primary last.
 * `titleSlot` replaces the h1's visible text with an editor (the product title field) while the h1 still names the
 * record for a screen reader.
 */
export function PageHeader({ title, actions, back, badges, meta, titleSlot }: {
  title: string
  actions?: ReactNode
  /** The list this page sits under: the breadcrumb's first step. */
  back?: { href: string; label: string }
  badges?: ReactNode
  meta?: ReactNode
  titleSlot?: ReactNode
}) {
  return (
    <header className="space-y-1.5">
      {back && <>
        <nav aria-label="Breadcrumb" className="hidden md:block">
          <ol className="flex min-w-0 items-center gap-1 text-label font-medium text-muted-foreground">
            <li><Link href={back.href} className="inline-flex min-h-6 items-center rounded-sm hover:text-foreground hover:underline">{back.label}</Link></li>
            <li aria-hidden="true">›</li>
            <li aria-current="page" className="min-w-0 truncate">{title}</li>
          </ol>
        </nav>
        <span className="md:hidden"><BackLink href={back.href} label={back.label} /></span>
      </>}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            {titleSlot
              ? <><h1 className="sr-only">{title}</h1>{titleSlot}</>
              : <h1 title={title} className="line-clamp-2 min-w-0 font-display text-title font-semibold [overflow-wrap:anywhere]">{title}</h1>}
            {badges}
          </div>
          {meta && <div className="text-sm text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:ml-auto sm:max-w-[50%] sm:justify-end">{actions}</div>}
      </div>
    </header>
  )
}

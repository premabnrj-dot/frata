import Link from 'next/link'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/view-tabs.tsx
//
// A LIST'S VIEWS, AS TABS WITH COUNTS (design-language § Work queues 8): each
// is a link (the view is in the address, so it can be shared, reloaded and
// gone back to), marked aria-current, not an ARIA tablist — these navigate.
// Counts come from their own query over every row (§ UX foundation 17). In
// Neel they never wrap: one row that scrolls sideways when it can't fit. A work queue with many views (Orders)
// passes `scroll` too: on a phone it runs to the screen's edge, the last tab cut there so
// there is visibly more (full e2e 2026-11-12: a wrapped "Not paid online" sat
// alone on its own row).
// =============================================================================

export type ViewTab = { href: string; label: string; count?: number; current: boolean; apart?: boolean }

export function ViewTabs({ label, tabs, scroll = false }: { label: string; tabs: ViewTab[]; scroll?: boolean }) {
  return (
    <nav aria-label={label} className={cn('overflow-x-auto border-b border-border [scrollbar-width:none]', scroll && '-mx-4 px-4 md:-mx-1 md:px-1 md:[scrollbar-width:thin]')}>
      {/* Neel § Components: one row that scrolls sideways, never a second row (`scroll` also runs it to the phone's edge). */}
      <ul className="flex w-max min-w-full items-center gap-5">
        {tabs.map((t) => (
          <li key={t.href} className={cn('shrink-0', t.apart && 'ml-auto pl-4')}>
            {/* Neel § Components: underline tabs 20 apart; the current one in text and a 2 px neel line (no thread). */}
            <Link href={t.href} aria-current={t.current ? 'page' : undefined}
              className={cn('-mb-px inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 text-sm font-medium md:min-h-10',
                t.current ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {t.label}
              {t.count !== undefined ? <span className={cn('rounded-full px-1.5 py-[3px] font-num text-small leading-none font-medium', t.current ? 'bg-select text-link' : 'bg-line-soft text-muted-foreground')}>{t.count.toLocaleString('en-IN')}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

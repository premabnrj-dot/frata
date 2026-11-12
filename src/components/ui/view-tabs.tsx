import Link from 'next/link'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/view-tabs.tsx
//
// A LIST'S VIEWS, AS TABS WITH COUNTS (design-language § Work queues 8): each
// is a link (the view is in the address, so it can be shared, reloaded and
// gone back to), marked aria-current, not an ARIA tablist — these navigate.
// Counts come from their own query over every row (§ UX foundation 17). By
// default they wrap to a second line. A work queue with many views (Orders)
// passes `scroll`: one row that never wraps and scrolls sideways when it
// can't fit; on a phone it runs to the screen's edge, the last tab cut there so
// there is visibly more (full e2e 2026-11-12: a wrapped "Not paid online" sat
// alone on its own row).
// =============================================================================

export type ViewTab = { href: string; label: string; count?: number; current: boolean; apart?: boolean }

export function ViewTabs({ label, tabs, scroll = false }: { label: string; tabs: ViewTab[]; scroll?: boolean }) {
  return (
    <nav aria-label={label} className={cn(scroll && '-mx-4 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] md:-mx-1 md:px-1 md:[scrollbar-width:thin]')}>
      <ul className={cn('flex items-center gap-1', scroll ? 'w-max min-w-full' : 'flex-wrap')}>
        {tabs.map((t) => (
          <li key={t.href} className={cn('shrink-0', t.apart && 'ml-auto pl-4')}>
            <Link href={t.href} aria-current={t.current ? 'page' : undefined}
              className={cn('inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm md:min-h-9',
                t.current ? 'bg-accent font-semibold text-foreground shadow-[inset_0_-2px_0_var(--thread)]' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
              {t.count !== undefined ? <span className={cn('rounded-sm px-1.5 font-mono text-xs text-neutral-text tabular-nums', t.current ? 'bg-background' : 'bg-neutral')}>{t.count.toLocaleString('en-IN')}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

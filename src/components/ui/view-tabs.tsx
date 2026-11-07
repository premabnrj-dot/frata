import Link from 'next/link'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/view-tabs.tsx
//
// A LIST'S VIEWS, AS TABS WITH COUNTS (design-language § Work queues 8): each
// is a link (the view is in the address, so it can be shared, reloaded and
// gone back to), marked aria-current, not an ARIA tablist — these navigate.
// Counts come from their own query over every row (§ UX foundation 17). On a
// phone they wrap to a second line: never a sideways strip with nothing to show more (spec U, F3).
// =============================================================================

export type ViewTab = { href: string; label: string; count?: number; current: boolean; apart?: boolean }

export function ViewTabs({ label, tabs }: { label: string; tabs: ViewTab[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap items-center gap-1">
        {tabs.map((t) => (
          <li key={t.href} className={cn(t.apart && 'ml-auto pl-4')}>
            <Link href={t.href} aria-current={t.current ? 'page' : undefined}
              className={cn('inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm md:min-h-9',
                t.current ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
              {t.count !== undefined ? <span className="rounded-sm bg-neutral px-1.5 font-mono text-xs text-neutral-text tabular-nums">{t.count.toLocaleString('en-IN')}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

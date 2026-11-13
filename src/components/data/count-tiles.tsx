import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type CountTile = { key: string; label: string; href: string; value: string; zero: boolean; line: ReactNode; ariaLabel: string }

/**
 * Counts of waiting work, each a link to its list (Home "Today", U·4). A row of tiles from md up; on a phone,
 * full-width rows in one frame, the count on the right (56 px targets). The first gets the most attention: put the
 * most urgent first. The caller words each line; a count that could not be read is never shown as 0.
 */
export function CountTiles({ label, tiles }: { label: string; tiles: CountTile[] }) {
  return (
    <nav aria-label={label} className="grid overflow-hidden rounded-md border border-border bg-card md:grid-cols-3 md:gap-3 md:overflow-visible md:border-0 md:bg-transparent">
      {tiles.map((t) => (
        <Link key={t.key} href={t.href} data-tile={t.key} aria-label={t.ariaLabel}
          className={cn('grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-accent',
            'md:grid-cols-1 md:gap-1 md:rounded-md md:border md:bg-card md:py-3 md:last:border-b md:hover:border-input md:hover:bg-card')}>
          <span className={cn('text-sm', t.zero ? 'text-muted-foreground' : 'font-semibold md:font-normal md:text-muted-foreground')}>{t.label}</span>
          <span className={cn('row-span-2 font-num text-xl font-semibold tabular-nums md:row-span-1 md:text-2xl', t.zero && 'text-muted-foreground')}>{t.value}</span>
          <span className="text-xs text-muted-foreground">{t.line}</span>
        </Link>
      ))}
    </nav>
  )
}

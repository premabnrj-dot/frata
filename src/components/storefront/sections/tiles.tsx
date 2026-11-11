import Link from 'next/link'
import type { StoreCatalogue } from '@/lib/queries/storefront'
import { Photo } from '../photo'
import type { Href } from '../shell'

type Tile = { c: StoreCatalogue['collections'][number]; first: StoreCatalogue['products'][number] }

/**
 * Collection tiles as a list (TS1b, architecture 8: one list for the Collection tiles section and a design's tiles).
 * `cols` 1: the section's own row (today's markup, byte for byte: e2e 05-shop-look). More: the list sits in a design's
 * column, so it is a 2-up grid and its photos are asked for at that width.
 */
export function TileList({ tiles, shape, href, cols = 1 }: { tiles: Tile[]; shape: 'portrait' | 'square' | 'circle'; href: Href; cols?: number }) {
  const circle = shape === 'circle'
  const tile = circle ? 'aspect-square rounded-full' : shape === 'square' ? 'aspect-square rounded-[var(--store-radius)]' : 'aspect-[4/5] rounded-[var(--store-radius)]'
  const inCol = cols > 1
  const list = inCol ? (circle ? 'grid grid-cols-2 gap-4 sm:grid-cols-4' : 'grid grid-cols-2 gap-3')
    : circle ? '-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 sm:mx-0 sm:scroll-px-0 sm:flex-wrap sm:px-0' : '-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 sm:mx-0 sm:scroll-px-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0'
  const item = inCol ? (circle ? 'text-center' : '') : circle ? 'w-24 shrink-0 snap-start text-center sm:w-28' : 'w-[70%] shrink-0 snap-start sm:w-auto'
  const sizes = circle ? '112px' : inCol ? `(min-width: 640px) ${Math.round(50 / cols)}vw, 50vw` : '(min-width: 640px) 33vw, 70vw'
  return (
    <ul className={list}>
      {tiles.map(({ c, first }) => (
        <li key={c.id} className={item}>
          <Link href={href(`/collections/${c.handle}`)} className="group block">
            <div className={`relative ${tile} overflow-hidden bg-store-chip`}>
              {first.images[0] && <Photo p={first.images[0]} alt="" sizes={sizes} max={1200} className="absolute inset-0 h-full w-full object-cover transition-transform duration-slow group-hover:scale-[1.02]" />}
            </div>
            <p className={circle ? 'mt-2 text-sm' : 'mt-2 text-base'}>{c.title}</p>
          </Link>
        </li>
      ))}
    </ul>
  )
}

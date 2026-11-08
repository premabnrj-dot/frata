import { cardBadge } from '@/domains/checkout/offer-showcase'
import Link from 'next/link'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { cardTag, priceOf, type ListProduct } from '@/domains/storefront/listing'
import { isColourOption } from '@/domains/storefront/picker'
import { Photo, type PhotoData } from './photo'
import type { Href } from './shell'
import { fill, wordsFor, type Lang } from './words'
import { Swatch, type SwatchColour, type SwatchImage } from './swatch'

export type CardProduct = Omit<ListProduct, 'colours'> & { handle: string; options: string[]; images: (PhotoData & SwatchImage & { optionValue: string | null })[]; colours: (SwatchColour & { family: string | null })[] }

export const money = (p: number) => formatInr(paise(p))

/** One product in a grid: cover (second photo on hover), name, price, every colour, one tag at most. */
export function ProductCard({ p, href, now, priority = false, badge = null, lang }: { p: CardProduct; href: Href; now: Date; priority?: boolean; lang?: Lang
  /** An offer's badge (Offers O·2), shown only where no availability tag is: one tag per card. */
  badge?: { label: string } | null }) {
  const price = priceOf(p)
  const w = wordsFor(lang)
  const t = cardTag(p, now)
  const tag = (t ? w.tag[t] : null) ?? (badge ?? cardBadge(p.offers, now))?.label ?? null
  const [cover, second] = p.images
  const ci = p.options.findIndex(isColourOption)
  const colours = ci >= 0 ? [...new Set(p.variants.map((v) => v.values[ci]!))] : []
  return (
    <li className="store-card group min-w-0">
      <Link href={href(`/products/${p.handle}`)} className="block space-y-2">
        <div className="relative aspect-[var(--store-ratio)] overflow-hidden rounded-[var(--store-radius)] bg-store-chip">
          {cover ? <Photo p={cover} alt={p.title} sizes="(min-width: 1024px) 25vw, 50vw" priority={priority} className="absolute inset-0 h-full w-full object-cover" />
            : <span className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-store-sub">{p.title}</span>}
          {second && <Photo p={second} alt="" sizes="(min-width: 1024px) 25vw, 50vw" className="store-hover absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-base [@media(hover:hover)]:block [@media(hover:hover)]:group-hover:opacity-100" />}
          {tag && <span className="absolute left-2 top-2 rounded-[var(--store-radius)] bg-store-paper/90 px-1.5 py-0.5 text-xs">{tag}</span>}
        </div>
        <p className="line-clamp-2 text-sm leading-snug">{p.title}</p>
        {price && <p className="text-sm"><span className="font-medium">{price.min !== price.max ? fill(w.from, { price: money(price.min) }) : money(price.min)}</span>{price.compareAt && <s className="ml-1.5 text-store-sub">{money(price.compareAt)}</s>}</p>}
      </Link>
      {colours.length > 1 && (
        <ul className="store-swatches mt-1.5 flex gap-1.5 overflow-x-auto pb-1" aria-label={fill(w.colours, { n: colours.length })}>
          {colours.map((c) => <li key={c} title={c}><Swatch c={p.colours.find((x) => x.value === c) ?? { value: c, hex: null, cropImageId: null, crop: null }} images={p.images} d={16} /><span className="sr-only">{c}</span></li>)}
        </ul>
      )}
    </li>
  )
}

export function ProductGrid({ products, href, now, empty, lang }: { products: CardProduct[]; href: Href; now: Date; empty: React.ReactNode; lang?: Lang }) {
  if (!products.length) return <div className="py-16 text-center text-store-sub">{empty}</div>
  return <ul className="grid grid-cols-[repeat(var(--store-cols),minmax(0,1fr))] gap-x-3 gap-y-8 sm:grid-cols-2 sm:gap-x-5 lg:grid-cols-[repeat(var(--store-dcols,4),minmax(0,1fr))]">{products.map((p, i) => <ProductCard key={p.id} p={p} href={href} now={now} priority={i < 2} lang={lang} />)}</ul>
}

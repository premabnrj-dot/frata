import Link from 'next/link'
import { displayFamily } from '@/components/shop-preview/fonts'
import { inCollection } from '@/domains/storefront/listing'
import { sourceProducts } from '@/domains/storefront/sources'
import { schemeVars } from '@/domains/themes/resolve'
import type { SectionInstance } from '@/domains/themes/sections'
import type { ResolvedTheme } from '@/domains/themes/types'
import type { StoreCatalogue, StoreShop } from '@/lib/queries/storefront'
import { ProductGrid } from '../card'
import { Photo } from '../photo'
import type { Href } from '../shell'

// =============================================================================
// FILE: src/components/storefront/sections/index.tsx — THE SECTION LIBRARY (themes spec § Sections).
// Server components only. Each takes its validated settings, the theme and shopper-safe data (StoreShop,
// StoreCatalogue: no cost fields, ADR-0003). A section with nothing to show renders nothing.
// T0: the three sections today's Home is made of, rendering exactly what it rendered (e2e 05-shop-look).
// =============================================================================

export type SectionCtx = { shop: StoreShop; cat: StoreCatalogue; theme: ResolvedTheme; href: Href; now: Date }
const wrap = 'mx-auto max-w-6xl px-4 sm:px-6'

const said = (b: { from: 'shopName' | 'tagline' } | { text: string } | undefined, shop: StoreShop) =>
  !b ? '' : 'text' in b ? b.text : b.from === 'shopName' ? shop.shopName : shop.tagline

/** A section painted in a scheme other than the page's sets its own colour tokens. */
function Paint({ s, theme, children }: { s: SectionInstance; theme: ResolvedTheme; children: React.ReactNode }) {
  if (s.scheme === 'paper') return <>{children}</>
  return <div className="bg-store-paper text-store-ink" style={schemeVars(theme, s.scheme) as React.CSSProperties}>{children}</div>
}

function Hero({ s, ctx }: { s: Extract<SectionInstance, { key: 'hero' }>; ctx: SectionCtx }) {
  const heading = said(s.heading, ctx.shop), text = said(s.text, ctx.shop)
  if (!heading) return null
  return (
    <section className={`${wrap} py-10 sm:py-16`}>
      <h1 className="max-w-3xl text-4xl leading-[1.05] sm:text-6xl" style={{ fontFamily: displayFamily(ctx.theme.settings.pairing) }}>{heading}</h1>
      {text && <p className="mt-3 max-w-xl text-lg text-store-sub">{text}</p>}
    </section>
  )
}

function CollectionTiles({ s, ctx }: { s: Extract<SectionInstance, { key: 'collection_tiles' }>; ctx: SectionCtx }) {
  const { cat, href, now } = ctx
  const tiles = cat.collections.map((c) => ({ c, first: inCollection(c, cat.products, now)[0] })).filter((t) => t.first).slice(0, s.count)
  if (!tiles.length) return null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={`${wrap} pb-12`}>
      <h2 id={h} className={s.heading ? 'mb-4 text-xl' : 'sr-only'}>{s.heading || 'Collections'}</h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
        {tiles.map(({ c, first }) => (
          <li key={c.id} className="w-[70%] shrink-0 snap-start sm:w-auto">
            <Link href={href(`/collections/${c.handle}`)} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-store-chip">
                {first!.images[0] && <Photo p={first!.images[0]} alt="" sizes="(min-width: 640px) 33vw, 70vw" className="absolute inset-0 h-full w-full object-cover transition-transform duration-slow group-hover:scale-[1.02]" />}
              </div>
              <p className="mt-2 text-base">{c.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Where "See all" goes: only a page that shows the whole list (the cached shop has no query strings). */
const allOf = (src: Extract<SectionInstance, { key: 'products' }>['source']) =>
  src.kind === 'newest' ? '/products' : src.kind === 'collection' ? `/collections/${src.handle}` : null

function Products({ s, ctx }: { s: Extract<SectionInstance, { key: 'products' }>; ctx: SectionCtx }) {
  const list = sourceProducts(s.source, ctx.cat, ctx.now)
  const all = s.viewAll && list.length > s.count ? allOf(s.source) : null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={wrap}>
      <div className="mb-4 flex items-baseline justify-between"><h2 id={h} className="text-xl">{s.heading}</h2>{all && <Link href={ctx.href(all)} className="text-sm underline underline-offset-4">See all</Link>}</div>
      <ProductGrid products={list.slice(0, s.count)} href={ctx.href} now={ctx.now} empty="New pieces are on their way." />
    </section>
  )
}

export function Sections({ list, ctx }: { list: SectionInstance[]; ctx: SectionCtx }) {
  return (
    <>
      {list.filter((s) => !s.hidden).map((s) => (
        <Paint key={s.id} s={s} theme={ctx.theme}>
          {s.key === 'hero' ? <Hero s={s} ctx={ctx} /> : s.key === 'collection_tiles' ? <CollectionTiles s={s} ctx={ctx} /> : <Products s={s} ctx={ctx} />}
        </Paint>
      ))}
    </>
  )
}

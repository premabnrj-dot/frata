import Link from 'next/link'
import { sourceProducts } from '@/domains/storefront/sources'
import type { SectionOf } from '@/domains/themes/sections'
import { ProductCard, ProductGrid } from '../card'
import { wordsFor } from '../words'
import { Sized, wrap } from './parts'
import type { SectionCtx } from './index'

// The Products section (split from sections/index.tsx for theme Signal, plan S1-2).

/** Where "See all" goes: only a page that shows the whole list (the cached shop has no query strings). */
const allOf = (src: SectionOf<'products'>['source']) =>
  src.kind === 'newest' ? '/products' : src.kind === 'collection' ? `/collections/${src.handle}` : null

export function Products({ s, ctx }: { s: SectionOf<'products'>; ctx: SectionCtx }) {
  const ranked = s.source.kind === 'best_sellers' ? ctx.bestSellers?.[s.source.days] ?? [] : []
  const list = sourceProducts(s.source, ctx.cat, ctx.now, ranked)
  if (!list.length && s.source.kind !== 'newest') return null
  const all = s.viewAll && list.length > s.count ? allOf(s.source) : null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={wrap}>
      <div className="mb-4 flex items-baseline justify-between"><h2 id={h} className="text-xl"><Sized>{s.heading}</Sized></h2>{all && <Link href={ctx.href(all)} className="text-sm underline underline-offset-4">{wordsFor(ctx.shop.shopLanguage).seeAll}</Link>}</div>
      {s.layout === 'rail'
        ? <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0">{list.slice(0, s.count).map((p, i) => <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[23%]"><ProductCard p={p} href={ctx.href} now={ctx.now} lang={ctx.shop.shopLanguage} priority={!!ctx.lead && i < 2} /></div>)}</ul>
        : <ProductGrid products={list.slice(0, s.count)} href={ctx.href} now={ctx.now} lang={ctx.shop.shopLanguage} empty={wordsFor(ctx.shop.shopLanguage).emptyShop} lead={!!ctx.lead} />}
    </section>
  )
}


import Link from 'next/link'
import { sourceProducts } from '@/domains/storefront/sources'
import { inCollection } from '@/domains/storefront/listing'
import { MAX_PER_TAB, MAX_TABS, type SectionOf } from '@/domains/themes/sections'
import { ProductCard, ProductGrid } from '../card'
import { wordsFor } from '../words'
import { Label, Sized, wrap } from './parts'
import { RailCounter } from './rail-counter'
import type { SectionCtx } from './index'

// The Products section (split from sections/index.tsx for theme Signal, plan S1-2): a grid, a swipe row (with a
// "01 / 10" counter where the theme offers it), or (Signal) tabs, one per collection, with no script: each tab is a
// radio and globals.css shows the panel of the checked one (speed review: CSS-only, ≤ 5 tabs × 8 pieces; a hidden
// tab's cards carry their cover only, and display:none keeps their lazy photos from loading).

/** Where "See all" goes: only a page that shows the whole list (the cached shop has no query strings). */
const allOf = (src: SectionOf<'products'>['source']) =>
  src.kind === 'newest' ? '/products' : src.kind === 'collection' ? `/collections/${src.handle}` : null

export function Products({ s, ctx }: { s: SectionOf<'products'>; ctx: SectionCtx }) {
  const h = `${s.id}-h`
  const lang = ctx.shop.shopLanguage
  if (s.layout === 'tabs') {
    // No tabs picked: the shop's first collections (up to 5), so a new theme shows tabs before the merchant picks.
    const handles = s.tabs.length ? s.tabs : ctx.cat.collections.map((c) => c.handle)
    const tabs = handles.flatMap((handle) => {
      const c = ctx.cat.collections.find((x) => x.handle === handle)
      if (!c) return []
      const list = inCollection(c, ctx.cat.products, ctx.now).slice(0, Math.min(s.count, MAX_PER_TAB))
      return list.length ? [{ c, list }] : []
    }).slice(0, MAX_TABS)
    if (!tabs.length) return null
    return (
      <section aria-labelledby={h} className={wrap}>
        <div className="store-tabs">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><Label text={s.label} /><h2 id={h} className="text-xl"><Sized>{s.heading}</Sized></h2></div>
            <div className="store-tab-row" role="radiogroup" aria-labelledby={h}>
              {tabs.map(({ c }, i) => (
                <label key={c.id} className="store-tab"><input type="radio" name={`${s.id}-tab`} value={c.handle} defaultChecked={i === 0} className="sr-only" />{c.title}</label>
              ))}
            </div>
          </div>
          {tabs.map(({ c, list }, i) => (
            <div key={c.id} className="store-tab-panel" data-tab={i}>
              <ProductGrid products={i === 0 ? list : list.map((p) => ({ ...p, images: p.images.slice(0, 1) }))} href={ctx.href} now={ctx.now} lang={lang} empty="" lead={!!ctx.lead && i === 0} />
            </div>
          ))}
        </div>
      </section>
    )
  }
  const ranked = s.source.kind === 'best_sellers' ? ctx.bestSellers?.[s.source.days] ?? [] : []
  const list = sourceProducts(s.source, ctx.cat, ctx.now, ranked)
  if (!list.length && s.source.kind !== 'newest') return null
  const all = s.viewAll && list.length > s.count ? allOf(s.source) : null
  const shown = list.slice(0, s.count)
  const counter = s.layout === 'rail' && ctx.theme.settings.railCounter && shown.length > 1
  return (
    <section aria-labelledby={h} className={wrap}>
      <Label text={s.label} />
      <div className="mb-4 flex items-baseline justify-between"><h2 id={h} className="text-xl"><Sized>{s.heading}</Sized></h2>{all && <Link href={ctx.href(all)} className="text-sm underline underline-offset-4">{wordsFor(lang).seeAll}</Link>}</div>
      {s.layout === 'rail'
        ? <ul id={counter ? `${s.id}-rail` : undefined} className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0">{shown.map((p, i) => <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[23%]"><ProductCard p={p} href={ctx.href} now={ctx.now} lang={lang} priority={!!ctx.lead && i < 2} /></div>)}</ul>
        : <ProductGrid products={shown} href={ctx.href} now={ctx.now} lang={lang} empty={wordsFor(lang).emptyShop} lead={!!ctx.lead} />}
      {counter && <RailCounter rail={`${s.id}-rail`} total={shown.length} />}
    </section>
  )
}

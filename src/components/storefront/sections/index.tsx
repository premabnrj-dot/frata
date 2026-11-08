import Link from 'next/link'
import { inCollection, isListed, priceOf } from '@/domains/storefront/listing'
import { lookPieces, sourceProducts } from '@/domains/storefront/sources'
import { truePromises } from '@/domains/themes/readiness'
import { schemeVars } from '@/domains/themes/resolve'
import type { SectionInstance, SectionOf } from '@/domains/themes/sections'
import type { ResolvedTheme } from '@/domains/themes/types'
import { dayIN } from '@/lib/format-date'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { StoreCatalogue, StoreShop } from '@/lib/queries/storefront'
import { ProductCard, ProductGrid } from '../card'
import { fill, wordsFor } from '../words'
import { Photo } from '../photo'
import type { Href } from '../shell'

// =============================================================================
// FILE: src/components/storefront/sections/index.tsx — THE SECTION LIBRARY (themes spec § Sections).
// Server components only. Each takes its validated settings, the theme and shopper-safe data (StoreShop,
// StoreCatalogue: no cost fields, ADR-0003; Best sellers arrives as ranked ids only). A section with nothing to
// show renders nothing. Spacing, corners, photo shape and heading size come from the theme's CSS custom properties
// (settingVars), so Classic renders exactly what the shop rendered before themes (e2e 05-shop-look).
// =============================================================================

export type SectionCtx = { shop: StoreShop; cat: StoreCatalogue; theme: ResolvedTheme; href: Href; now: Date; bestSellers?: Partial<Record<30 | 90, string[]>> }
const wrap = 'mx-auto max-w-6xl px-4 sm:px-6'
const pad = 'py-[calc(var(--store-space)*2.5rem)] sm:py-[calc(var(--store-space)*3.5rem)]'
const rupees = (p: number) => formatInr(paise(p))
/** Heading text at the theme's size (100% of the class's size for Regular). */
const Sized = ({ children }: { children: React.ReactNode }) => <span className="[font-size:calc(var(--store-h-scale)*100%)]">{children}</span>
const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => <h2 id={id} className="text-xl" style={{ fontFamily: 'var(--store-display)' }}><Sized>{children}</Sized></h2>

const said = (b: { from: 'shopName' | 'tagline' } | { text: string } | undefined, shop: StoreShop) =>
  !b ? '' : 'text' in b ? b.text : b.from === 'shopName' ? shop.shopName : shop.tagline

/** A section painted in a scheme other than the page's sets its own colour tokens. */
function Paint({ s, theme, children }: { s: SectionInstance; theme: ResolvedTheme; children: React.ReactNode }) {
  if (s.scheme === 'paper') return <>{children}</>
  return <div className="bg-store-paper text-store-ink" style={schemeVars(theme, s.scheme) as React.CSSProperties}>{children}</div>
}

function Button({ b, href }: { b: { label: string; link: string } | null; href: Href }) {
  if (!b || !b.label) return null
  return <Link href={href(b.link)} className="store-btn inline-flex min-h-11 items-center rounded-[var(--store-radius)] bg-store-button px-5 text-sm font-medium text-store-on-button">{b.label}</Link>
}

function Hero({ s, ctx }: { s: SectionOf<'hero'>; ctx: SectionCtx }) {
  const heading = said(s.heading, ctx.shop), text = said(s.text, ctx.shop)
  if (!heading) return null
  const title = <h1 className="max-w-3xl text-4xl leading-[1.05] sm:text-6xl" style={{ fontFamily: 'var(--store-display)' }}><Sized>{heading}</Sized></h1>
  if (s.layout === 'text' || !s.image) {
    // Classic's title block, exactly (also what a photo layout shows until a photo is added).
    return (
      <section className={`${wrap} py-[calc(var(--store-space)*2.5rem)] sm:py-[calc(var(--store-space)*4rem)]`}>
        {title}
        {text && <p className="mt-3 max-w-xl text-lg text-store-sub">{text}</p>}
        {s.button && <div className="mt-6"><Button b={s.button} href={ctx.href} /></div>}
      </section>
    )
  }
  const img = s.image
  const tall = s.height === 'tall' ? 'min-h-[70svh] sm:min-h-[80vh]' : 'min-h-[40svh] sm:min-h-[50vh]'
  if (s.layout === 'split') {
    return (
      <section className={`${wrap} ${pad} grid items-center gap-8 sm:grid-cols-2`}>
        <div className={`relative overflow-hidden bg-store-chip ${s.mask === 'arch' ? 'rounded-t-full' : 'rounded-[var(--store-radius)]'} aspect-[4/5]`}>
          <Photo p={img} alt={img.alt} sizes="(min-width: 640px) 50vw, 100vw" priority className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <div className="space-y-4">{title}{text && <p className="max-w-xl text-lg text-store-sub">{text}</p>}<Button b={s.button} href={ctx.href} /></div>
      </section>
    )
  }
  const centred = s.position === 'centre'
  return (
    <section className={`relative ${tall} overflow-hidden bg-store-chip`}>
      <Photo p={img} alt={s.layout === 'image' ? heading : img.alt} sizes="100vw" priority className="absolute inset-0 h-full w-full object-cover" />
      {s.layout === 'image_text' && (
        <div className={`relative z-10 flex ${tall} ${centred ? 'items-center justify-center text-center' : 'items-end'} bg-linear-to-t from-black/45 via-black/10 to-transparent`}>
          <div className={`${wrap} w-full space-y-3 py-10 text-white`}>{title}{text && <p className={`max-w-xl text-lg ${centred ? 'mx-auto' : ''}`}>{text}</p>}<Button b={s.button} href={ctx.href} /></div>
        </div>
      )}
      {s.layout === 'image' && <h1 className="sr-only">{heading}</h1>}
    </section>
  )
}

function CollectionTiles({ s, ctx }: { s: SectionOf<'collection_tiles'>; ctx: SectionCtx }) {
  const { cat, href, now } = ctx
  const pool = s.mode === 'picked' ? s.handles.flatMap((h) => cat.collections.filter((c) => c.handle === h)) : cat.collections
  const tiles = pool.map((c) => ({ c, first: inCollection(c, cat.products, now)[0] })).filter((t) => t.first).slice(0, s.mode === 'picked' ? 8 : s.count)
  if (!tiles.length) return null
  const h = `${s.id}-h`
  const circle = s.shape === 'circle'
  const shape = circle ? 'aspect-square rounded-full' : s.shape === 'square' ? 'aspect-square rounded-[var(--store-radius)]' : 'aspect-[4/5] rounded-[var(--store-radius)]'
  return (
    <section aria-labelledby={h} className={`${wrap} pb-[calc(var(--store-space)*3rem)]`}>
      {s.heading ? <div className="mb-4"><H2 id={h}>{s.heading}</H2></div> : <h2 id={h} className="sr-only">{wordsFor(ctx.shop.shopLanguage).collectionsNav}</h2>}
      <ul className={circle ? '-mx-4 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0' : '-mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0'}>
        {tiles.map(({ c, first }) => (
          <li key={c.id} className={circle ? 'w-24 shrink-0 snap-start text-center sm:w-28' : 'w-[70%] shrink-0 snap-start sm:w-auto'}>
            <Link href={href(`/collections/${c.handle}`)} className="group block">
              <div className={`relative ${shape} overflow-hidden bg-store-chip`}>
                {first!.images[0] && <Photo p={first!.images[0]} alt="" sizes={circle ? '112px' : '(min-width: 640px) 33vw, 70vw'} className="absolute inset-0 h-full w-full object-cover transition-transform duration-slow group-hover:scale-[1.02]" />}
              </div>
              <p className={circle ? 'mt-2 text-sm' : 'mt-2 text-base'}>{c.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Where "See all" goes: only a page that shows the whole list (the cached shop has no query strings). */
const allOf = (src: SectionOf<'products'>['source']) =>
  src.kind === 'newest' ? '/products' : src.kind === 'collection' ? `/collections/${src.handle}` : null

function Products({ s, ctx }: { s: SectionOf<'products'>; ctx: SectionCtx }) {
  const ranked = s.source.kind === 'best_sellers' ? ctx.bestSellers?.[s.source.days] ?? [] : []
  const list = sourceProducts(s.source, ctx.cat, ctx.now, ranked)
  if (!list.length && s.source.kind !== 'newest') return null
  const all = s.viewAll && list.length > s.count ? allOf(s.source) : null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={wrap}>
      <div className="mb-4 flex items-baseline justify-between"><h2 id={h} className="text-xl"><Sized>{s.heading}</Sized></h2>{all && <Link href={ctx.href(all)} className="text-sm underline underline-offset-4">{wordsFor(ctx.shop.shopLanguage).seeAll}</Link>}</div>
      {s.layout === 'rail'
        ? <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">{list.slice(0, s.count).map((p, i) => <div key={p.id} className="w-[44%] shrink-0 snap-start sm:w-[23%]"><ProductCard p={p} href={ctx.href} now={ctx.now} lang={ctx.shop.shopLanguage} priority={i < 2} /></div>)}</ul>
        : <ProductGrid products={list.slice(0, s.count)} href={ctx.href} now={ctx.now} lang={ctx.shop.shopLanguage} empty={wordsFor(ctx.shop.shopLanguage).emptyShop} />}
    </section>
  )
}

/** Price tiles: one tile per band, each opening its own short row of pieces below (no filtered page exists). */
function PriceTiles({ s, ctx }: { s: SectionOf<'price_tiles'>; ctx: SectionCtx }) {
  const listed = ctx.cat.products.filter((p) => isListed(p, ctx.now))
  const bands = s.bands.map((b, i) => {
    const label = b.minPaise === null ? `Under ${rupees(b.maxPaise!)}` : b.maxPaise === null ? `Above ${rupees(b.minPaise)}` : `${rupees(b.minPaise)}–${rupees(b.maxPaise)}`
    const items = listed.filter((p) => { const pr = priceOf(p)?.min; return pr !== undefined && (b.minPaise === null || pr >= b.minPaise) && (b.maxPaise === null || pr <= b.maxPaise) })
    return { i, label, items }
  }).filter((b) => b.items.length)
  if (!bands.length) return null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={`${wrap} ${pad} space-y-6`}>
      <H2 id={h}>{s.heading}</H2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {bands.map((b) => <li key={b.i}><a href={`#${s.id}-${b.i}`} className="flex min-h-14 items-center justify-center rounded-[var(--store-radius)] bg-store-chip px-3 text-center text-sm font-medium">{b.label}</a></li>)}
      </ul>
      {bands.map((b) => (
        <div key={b.i} id={`${s.id}-${b.i}`} className="scroll-mt-24 space-y-3">
          <h3 className="text-base font-medium">{b.label}</h3>
          <ProductGrid products={b.items.slice(0, 4)} href={ctx.href} now={ctx.now} lang={ctx.shop.shopLanguage} empty="" />
        </div>
      ))}
    </section>
  )
}

/** Promises in the shop's own facts: switching COD off removes "Pay on delivery" (spec § Sections rules). */
function Promises({ s, ctx }: { s: SectionOf<'promises'>; ctx: SectionCtx }) {
  const f = ctx.shop
  const t = truePromises({ collections: [], codOn: f.codOn, freeShippingAbove: f.freeShippingAbove, returnDays: f.returnDays, dispatchDays: f.dispatchDays })
  const w = wordsFor(f.shopLanguage).promise
  const words = s.show.filter((k) => t.includes(k)).map((k) =>
    k === 'cod' ? w.cod
      : k === 'free_shipping' ? fill(w.freeShipping, { above: rupees(f.freeShippingAbove!) })
        : k === 'returns' ? fill(f.returnKind === 'exchange_only' ? w.exchange : f.returnKind === 'refund_only' ? w.returns : w.exchangeOrReturns, { d: f.returnDays })
          : fill(f.dispatchDays === 1 ? w.shipsDay : w.shipsDays, { d: f.dispatchDays }))
  if (!words.length) return null
  return (
    <section aria-label={w.label} className={`${wrap} ${pad}`}>
      <ul className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-4">
        {words.map((w) => <li key={w} className="rounded-[var(--store-radius)] border border-store-line px-3 py-5">{w}</li>)}
      </ul>
    </section>
  )
}

function ImageText({ s, ctx }: { s: SectionOf<'image_text'>; ctx: SectionCtx }) {
  if (!s.image) return null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={`${wrap} ${pad} grid items-center gap-8 sm:grid-cols-2`}>
      <div className={`relative aspect-[4/5] overflow-hidden rounded-[var(--store-radius)] bg-store-chip ${s.side === 'right' ? 'sm:order-2' : ''}`}>
        <Photo p={s.image} alt={s.image.decorative ? '' : s.image.alt} sizes="(min-width: 640px) 50vw, 100vw" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="space-y-4">
        <H2 id={h}>{s.heading}</H2>
        {s.text.split(/\n{2,}/).filter(Boolean).map((p, i) => <p key={i} className="max-w-prose leading-relaxed text-store-sub">{p}</p>)}
        <Button b={s.button} href={ctx.href} />
      </div>
    </section>
  )
}

function DropTeaser({ s, ctx }: { s: SectionOf<'drop_teaser'>; ctx: SectionCtx }) {
  const at = new Date(s.at)
  if (at.getTime() <= ctx.now.getTime()) return null
  return (
    <section aria-label={s.heading} className={`relative overflow-hidden bg-store-button text-store-on-button`}>
      {s.image && <Photo p={s.image} alt={s.image.decorative ? '' : s.image.alt} sizes="100vw" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
      <div className={`${wrap} relative ${pad} text-center`}>
        <p className="text-3xl sm:text-5xl" style={{ fontFamily: 'var(--store-display)' }}><Sized>{s.heading}</Sized></p>
        <p className="mt-3 text-base">{dayIN(at)}</p>
      </div>
    </section>
  )
}

function RichText({ s, ctx }: { s: SectionOf<'rich_text'>; ctx: SectionCtx }) {
  if (!s.body.length && !s.heading) return null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={s.heading ? h : undefined} className={`${wrap} ${pad} ${s.align === 'centre' ? 'text-center' : ''}`}>
      <div className={`max-w-prose space-y-3 leading-relaxed ${s.align === 'centre' ? 'mx-auto' : ''}`}>
        {s.heading && <H2 id={h}>{s.heading}</H2>}
        {s.body.map((para, i) => (
          <p key={i}>{para.map((r, j) => {
            let n: React.ReactNode = r.text
            if (r.bold) n = <strong>{n}</strong>
            if (r.italic) n = <em>{n}</em>
            return r.link ? <Link key={j} href={ctx.href(r.link)} className="underline underline-offset-4">{n}</Link> : <span key={j}>{n}</span>
          })}</p>
        ))}
      </div>
    </section>
  )
}

function Logos({ s }: { s: SectionOf<'logos'> }) {
  if (!s.images.length) return null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={`${wrap} ${pad} space-y-4 text-center`}>
      <h2 id={h} className="text-sm uppercase tracking-[0.2em] text-store-sub">{s.heading}</h2>
      <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {s.images.map((img, i) => <li key={i} className="relative h-10 w-28"><Photo p={img} alt={img.alt} sizes="112px" className="absolute inset-0 h-full w-full object-contain" /></li>)}
      </ul>
    </section>
  )
}

/** Shop the look (Editorial 1.1): numbered dots on the photo, the same pieces listed beside it. A piece not listed
 *  on the shop today drops out; with none left, the section shows nothing. Each piece links to its page. */
function ShopTheLook({ s, ctx }: { s: SectionOf<'shop_the_look'>; ctx: SectionCtx }) {
  if (!s.image) return null
  const pieces = lookPieces(s.pieces, ctx.cat.products, ctx.now)
  if (!pieces.length) return null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={`${wrap} ${pad} grid items-start gap-8 sm:grid-cols-2`}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--store-radius)] bg-store-chip">
        <Photo p={s.image} alt={s.image.decorative ? '' : s.image.alt} sizes="(min-width: 640px) 50vw, 100vw" className="absolute inset-0 h-full w-full object-cover" />
        {pieces.map((x, i) => (
          <Link key={x.handle} href={ctx.href(`/products/${x.handle}`)} style={{ left: `${x.x}%`, top: `${x.y}%` }} aria-label={`${i + 1}: ${x.p.title}`}
            className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-store-paper text-sm font-semibold text-store-ink shadow">{i + 1}</Link>
        ))}
      </div>
      <div className="space-y-4">
        <H2 id={h}>{s.heading}</H2>
        <ol className="space-y-3">
          {pieces.map((x, i) => { const pr = priceOf(x.p); return (
            <li key={x.handle}><Link href={ctx.href(`/products/${x.handle}`)} className="flex items-center gap-3">
              <span className="relative block h-20 w-16 shrink-0 overflow-hidden rounded-[var(--store-radius)] bg-store-chip">{x.p.images[0] && <Photo p={x.p.images[0]} alt="" sizes="64px" className="absolute inset-0 h-full w-full object-cover" />}</span>
              <span className="text-sm"><span className="block">{i + 1} · {x.p.title}</span>{pr && <span className="block font-medium">{pr.min !== pr.max ? fill(wordsFor(ctx.shop.shopLanguage).from, { price: rupees(pr.min) }) : rupees(pr.min)}</span>}</span>
            </Link></li>
          ) })}
        </ol>
      </div>
    </section>
  )
}

function One({ s, ctx }: { s: SectionInstance; ctx: SectionCtx }) {
  switch (s.key) {
    case 'hero': return <Hero s={s} ctx={ctx} />
    case 'collection_tiles': return <CollectionTiles s={s} ctx={ctx} />
    case 'products': return <Products s={s} ctx={ctx} />
    case 'price_tiles': return <PriceTiles s={s} ctx={ctx} />
    case 'promises': return <Promises s={s} ctx={ctx} />
    case 'image_text': return <ImageText s={s} ctx={ctx} />
    case 'drop_teaser': return <DropTeaser s={s} ctx={ctx} />
    case 'rich_text': return <RichText s={s} ctx={ctx} />
    case 'logos': return <Logos s={s} />
    case 'shop_the_look': return <ShopTheLook s={s} ctx={ctx} />
  }
}

export function Sections({ list, ctx }: { list: SectionInstance[]; ctx: SectionCtx }) {
  return (
    <>
      {list.filter((s) => !s.hidden).map((s) => (
        <Paint key={s.id} s={s} theme={ctx.theme}>
          <div data-section={s.id} className="contents"><One s={s} ctx={ctx} /></div>
        </Paint>
      ))}
    </>
  )
}

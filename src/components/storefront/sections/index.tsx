import { ShopIcon } from '../icon'
import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { errName } from '@/lib/log'
import { inCollection, isListed, priceOf } from '@/domains/storefront/listing'
import { lookPieces } from '@/domains/storefront/sources'
import { truePromises } from '@/domains/themes/readiness'
import type { SectionInstance, SectionOf } from '@/domains/themes/sections'
import type { ResolvedTheme } from '@/domains/themes/types'
import { dayIN } from '@/lib/format-date'
import type { StoreCatalogue, StoreShop } from '@/lib/queries/storefront'
import { ProductGrid } from '../card'
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

export type SectionCtx = { shop: StoreShop; cat: StoreCatalogue; theme: ResolvedTheme; href: Href; now: Date; bestSellers?: Partial<Record<30 | 90, string[]>>
  /** V1: the live look's playable videos (id → playback id); a section names one by id. */
  videos?: LookVideos
  /** The page's first section: only its photos load ahead of the rest (speed review P15: four `priority` images competed). */
  lead?: boolean
  /** The customizer's preview: a section that fails says so there (on the shop it is left out). */
  preview?: boolean
  /** The customizer's look preview (with samples): a design shows the theme's sample photos and example words, marked
   *  (TS0b). Never on the shop or /console/preview, which show the shop as shoppers see it. */
  samples?: boolean }
import { Button, H2, Label, Paint, Runs, Sized, pad, rupees, said, wrap } from './parts'
import { DesignSection } from '../blocks'
import { Products } from './products'
import { Loop, LoopPoster } from './loop'
import { Spotlight, Statement, StoryFan } from './story'
import type { LookVideos } from '@/lib/themes/page-look'

function Hero({ s, ctx }: { s: SectionOf<'hero'>; ctx: SectionCtx }) {
  const heading = said(s.heading, ctx.shop), text = said(s.text, ctx.shop)
  if (!heading) return null
  // Signal 1.2: a handwritten line above the heading (resolve keeps it only where the theme offers it).
  const title = <>{s.script?.trim() && <p className="store-script store-script-hero">{s.script}</p>}<h1 className="max-w-3xl text-4xl leading-[1.05] sm:text-6xl" style={{ fontFamily: 'var(--store-display)' }}><Sized>{heading}</Sized></h1></>
  // V1: a playable loop stands in for a missing photo (its first frame paints first).
  const loop = s.video && ctx.videos?.[s.video.id] ? s.video.id : undefined
  if (s.layout === 'text' || (!s.image && !loop)) {
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
  const lead = !!ctx.lead
  const tall = s.height === 'tall' ? 'min-h-[70svh] sm:min-h-[80vh]' : 'min-h-[40svh] sm:min-h-[50vh]'
  if (s.layout === 'split') {
    return (
      <section className={`${wrap} ${pad} grid items-center gap-8 sm:grid-cols-2`}>
        <div className={`relative overflow-hidden bg-store-chip ${s.mask === 'arch' ? 'rounded-t-full' : 'rounded-[var(--store-radius)]'} aspect-[4/5]`}>
          {img ? <Photo p={img} focus={img.focus} alt={img.alt} sizes="(min-width: 640px) 50vw, 100vw" priority={lead} className="absolute inset-0 h-full w-full object-cover" /> : <LoopPoster id={loop} videos={ctx.videos} lead={lead} width={960} />}
          <Loop id={s.video?.id} videos={ctx.videos} />
        </div>
        <div className="space-y-4">{title}{text && <p className="max-w-xl text-lg text-store-sub">{text}</p>}<Button b={s.button} href={ctx.href} /></div>
      </section>
    )
  }
  const centred = s.position === 'centre'
  return (
    <section data-bleed="" className={`relative ${tall} overflow-hidden bg-store-chip`}>
      {img ? <Photo p={img} focus={img.focus} alt={s.layout === 'image' ? heading : img.alt} sizes="100vw" priority={lead} className="absolute inset-0 h-full w-full object-cover" /> : <LoopPoster id={loop} videos={ctx.videos} lead={lead} width={1600} />}
      <Loop id={s.video?.id} videos={ctx.videos} />
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
      {s.heading ? <div className="mb-4"><Label text={s.label} /><H2 id={h}>{s.heading}</H2></div> : <h2 id={h} className="sr-only">{wordsFor(ctx.shop.shopLanguage).collectionsNav}</h2>}
      <ul className={circle ? '-mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 sm:mx-0 sm:scroll-px-0 sm:flex-wrap sm:px-0' : '-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 sm:mx-0 sm:scroll-px-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0'}>
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
  const ICON = { cod: 'cash', free_shipping: 'truck', returns: 'return', dispatch: 'package' } as const
  const words = s.show.filter((k) => t.includes(k)).map((k) => [k,
    k === 'cod' ? w.cod
      : k === 'free_shipping' ? fill(w.freeShipping, { above: rupees(f.freeShippingAbove!) })
        : k === 'returns' ? fill(f.returnKind === 'exchange_only' ? w.exchange : f.returnKind === 'refund_only' ? w.returns : w.exchangeOrReturns, { d: f.returnDays })
          : fill(f.dispatchDays === 1 ? w.shipsDay : w.shipsDays, { d: f.dispatchDays })] as const)
  if (!words.length) return null
  return (
    <section aria-label={w.label} className={`${wrap} ${pad}`}>
      <ul className="grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-4">
        {words.map(([k, w]) => <li key={k} className="flex flex-col items-center gap-2 rounded-[var(--store-radius)] border border-store-line px-3 py-5">{k in ICON && <ShopIcon name={ICON[k as keyof typeof ICON]} set={ctx.theme.site.icons} className="size-6 text-store-accent" />}{w}</li>)}
      </ul>
    </section>
  )
}

function ImageText({ s, ctx }: { s: SectionOf<'image_text'>; ctx: SectionCtx }) {
  const loop = s.video && ctx.videos?.[s.video.id] ? s.video.id : undefined
  if (!s.image && !loop) return null
  const h = `${s.id}-h`
  return (
    <section aria-labelledby={h} className={`${wrap} ${pad} grid items-center gap-8 sm:grid-cols-2`}>
      <div className={`relative aspect-[4/5] overflow-hidden rounded-[var(--store-radius)] bg-store-chip ${s.side === 'right' ? 'sm:order-2' : ''}`}>
        {s.image ? <Photo p={s.image} focus={s.image.focus} alt={s.image.decorative ? '' : s.image.alt} sizes="(min-width: 640px) 50vw, 100vw" className="absolute inset-0 h-full w-full object-cover" /> : <LoopPoster id={loop} videos={ctx.videos} lead={false} width={960} />}
        <Loop id={s.video?.id} videos={ctx.videos} />
      </div>
      <div className="space-y-4">
        <Label text={s.label} /><H2 id={h}>{s.heading}</H2>
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
      {s.image && <Photo p={s.image} focus={s.image.focus} alt={s.image.decorative ? '' : s.image.alt} sizes="100vw" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
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
        <Runs body={s.body} href={ctx.href} />
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
        {s.images.map((img, i) => <li key={i} className="relative h-10 w-28"><Photo p={img} focus={img.focus} alt={img.alt} sizes="112px" className="absolute inset-0 h-full w-full object-contain" /></li>)}
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
        <Photo p={s.image} focus={s.image.focus} alt={s.image.decorative ? '' : s.image.alt} sizes="(min-width: 640px) 50vw, 100vw" className="absolute inset-0 h-full w-full object-cover" />
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

/** One section's markup, computed now (each section is a plain function of its settings and data, called directly,
 *  so the guard below sees anything it throws while it reads its data). */
function One({ s, ctx }: { s: SectionInstance; ctx: SectionCtx }): React.ReactNode {
  switch (s.key) {
    case 'hero': return Hero({ s, ctx })
    case 'collection_tiles': return CollectionTiles({ s, ctx })
    case 'products': return Products({ s, ctx })
    case 'price_tiles': return PriceTiles({ s, ctx })
    case 'promises': return Promises({ s, ctx })
    case 'image_text': return s.layout === 'spotlight' ? Spotlight({ s, ctx }) : ImageText({ s, ctx })
    case 'drop_teaser': return DropTeaser({ s, ctx })
    case 'rich_text': return RichText({ s, ctx })
    case 'logos': return Logos({ s })
    case 'shop_the_look': return ShopTheLook({ s, ctx })
    case 'story_fan': return StoryFan({ s, ctx })
    case 'statement': return Statement({ s })
    case 'design': return DesignSection({ s, ctx })
  }
}

/**
 * One section, guarded: a section that throws while it renders is left out of the page (the rest of the shop still
 * renders) and named in the customizer's preview. Called as a function so the guard sees its errors; Next's own
 * control-flow errors pass through (architecture review 2026-11-09, finding 5). Logs the error's name only.
 */
export function Guarded({ s, ctx }: { s: SectionInstance; ctx: SectionCtx }) {
  try {
    return One({ s, ctx })
  } catch (e) {
    unstable_rethrow(e)
    console.error('section failed', s.key, errName(e))
    return ctx.preview ? <div role="status" className="mx-4 my-6 grid min-h-28 place-items-center rounded-[var(--store-radius)] border border-dashed border-store-sub p-4 text-center text-sm text-store-sub sm:mx-6">This section couldn’t be shown. Hide it or undo the last change.</div> : null
  }
}

export function Sections({ list, ctx }: { list: SectionInstance[]; ctx: SectionCtx }) {
  return (
    <>
      {list.filter((s) => !s.hidden).map((s, i) => (
        <Paint key={s.id} s={s} theme={ctx.theme}>
          <div data-section={s.id} data-key={s.key} data-lead={i === 0 ? '' : undefined} className="contents"><Guarded s={s} ctx={{ ...ctx, lead: i === 0 }} /></div>
        </Paint>
      ))}
    </>
  )
}

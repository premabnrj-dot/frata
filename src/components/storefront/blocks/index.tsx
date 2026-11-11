import Link from 'next/link'
import { lookPieces, sourceProducts, tilesOf } from '@/domains/storefront/sources'
import { isListed, priceOf } from '@/domains/storefront/listing'
import { resolveDesign, type RNode } from '@/domains/themes/blocks'
import { GRID_PIECES, MAX_TILES, type SectionOf } from '@/domains/themes/sections'
import { dropLineIN } from '@/lib/format-date'
import { ProductGrid, money } from '../card'
import { Photo } from '../photo'
import type { SectionCtx } from '../sections'
import { Loop, LoopPoster } from '../sections/loop'
import { Button, Label, Runs, Sized, pad, wrap } from '../sections/parts'
import { TileList } from '../sections/tiles'
import { fill, wordsFor } from '../words'

// =============================================================================
// FILE: src/components/storefront/blocks/index.tsx — a design on the shop (Theme Studio TS0b). Server components only:
// no client script on any shop route. The theme's design and the owner's words are merged by the pure
// resolveDesign (on the shop: never a sample photo or an example). Layout is a closed set of classes and data
// attributes with one rule each in base.css (.store-b-*). A block never reads data: the section passes what it has
// (TS1b: commerce blocks draw from the Home page's own catalogue and best-sellers ids, `ctx`; a page has none, so they
// draw nothing there — a page's template has no such block anyway).
// =============================================================================

const SIZE = { l: 'text-3xl sm:text-5xl', m: 'text-2xl sm:text-3xl', s: 'text-lg sm:text-xl' } as const
/** How wide a photo shows, by the columns it sits in (one rule, for `sizes`). */
const sizesFor = (cols: number) => (cols > 1 ? `(min-width: 640px) ${Math.round(100 / cols)}vw, 100vw` : '(min-width: 640px) 60vw, 100vw')

/** One block, rendered (designs on Home; a page's blocks too: TS1a). `href` maps a shop path to this shop's link.
 *  `ctx` and `video` (TS1b): the page's data and the section's loop, for the commerce and video blocks. */
export function BlockNode({ n, href, sid, cols, ctx, video }: { n: RNode; href: SectionCtx['href']; sid: string; cols: number; ctx?: SectionCtx; video?: string }): React.ReactNode {
  const ex = 'example' in n && n.example ? { 'data-example': '' } : {}
  switch (n.kind) {
    case 'heading': {
      const H = n.level === 2 ? 'h2' : 'h3'
      return <H id={`${sid}-${n.id}`} className={`${SIZE[n.size]} leading-[1.05] text-balance`} style={{ fontFamily: 'var(--store-display)' }} {...ex}><Sized>{n.text}</Sized></H>
    }
    case 'text': return <div className="max-w-prose space-y-3 leading-relaxed text-store-sub" {...ex}><Runs body={n.body} href={href} /></div>
    case 'image': {
      const img = n.image
      return (
        <div className="store-b-photo" data-ratio={n.ratio} {...(n.sample ? { 'data-example': '' } : {})}>
          <Photo p={img} focus={img.focus} alt={img.decorative ? '' : img.alt} sizes={sizesFor(cols)} priority={!!n.eager} className="absolute inset-0 h-full w-full object-cover" />
        </div>
      )
    }
    case 'button': return <Button b={{ label: n.label, link: n.link }} href={href} />
    case 'accordion': return (
      <div className="store-b-acc">
        {n.items.map((i, k) => (
          <details key={k}><summary>{i.q}</summary><p {...(i.example ? { 'data-example': '' } : {})}>{i.a}</p></details>
        ))}
      </div>
    )
    case 'product_grid': {
      if (!ctx) return null
      const ranked = n.source.kind === 'best_sellers' ? ctx.bestSellers?.[n.source.days] ?? [] : []
      const list = sourceProducts(n.source, ctx.cat, ctx.now, ranked).slice(0, GRID_PIECES)
      if (!list.length) return null
      return <div className="store-b-wide"><ProductGrid products={list} href={href} now={ctx.now} lang={ctx.shop.shopLanguage} empty="" lead={n.eager ?? false} /></div>
    }
    case 'featured_product': {
      if (!ctx) return null
      // No piece picked (the preview only): the newest, marked, so the owner sees the block before picking.
      const p = n.handle ? lookPieces([{ handle: n.handle }], ctx.cat.products, ctx.now)[0]?.p : ctx.cat.products.find((q) => isListed(q, ctx.now))
      if (!p) return null
      const cover = p.images[0], price = priceOf(p), w = wordsFor(ctx.shop.shopLanguage)
      return (
        <Link href={href(`/products/${p.handle}`)} className="store-b-piece group" {...(n.handle ? {} : { 'data-example': '' })}>
          <div className="store-ph">
            {cover && <Photo p={cover} alt="" sizes={sizesFor(cols)} priority={!!n.eager} className="absolute inset-0 h-full w-full object-cover" />}
          </div>
          <p className="mt-3 text-lg leading-snug">{p.title}</p>
          {price && <p className="store-price text-sm font-medium">{price.min !== price.max ? fill(w.from, { price: money(price.min) }) : money(price.min)}</p>}
          <p className="mt-2 text-sm underline underline-offset-4">{w.viewPiece}</p>
        </Link>
      )
    }
    case 'collection_tiles': {
      if (!ctx) return null
      const tiles = tilesOf(ctx.cat, ctx.now, n.handles, MAX_TILES)
      return tiles.length ? <div className="store-b-wide"><TileList tiles={tiles} shape={n.shape} href={href} cols={cols} /></div> : null
    }
    case 'video': {
      // The poster is the first paint and the fallback; with none, the loop's first frame; with neither, nothing.
      const playable = !!(video && ctx?.videos?.[video])
      if (!n.poster && !playable) return null
      const img = n.poster
      return (
        <div className="store-b-photo" data-ratio={n.ratio} {...(n.sample ? { 'data-example': '' } : {})}>
          {img ? <Photo p={img} focus={img.focus} alt={img.decorative ? '' : img.alt} sizes={sizesFor(cols)} priority={!!n.eager} className="absolute inset-0 h-full w-full object-cover" />
            : <LoopPoster id={video} videos={ctx?.videos} lead={!!n.eager} width={960} />}
          <Loop id={video} videos={ctx?.videos} />
        </div>
      )
    }
    case 'date': {
      const at = new Date(n.at)
      // Hidden once passed (never a ticking count: the page is cached; the drop's moment, said once).
      if (!ctx || Number.isNaN(at.getTime()) || at.getTime() <= ctx.now.getTime()) return null
      return <p className="store-b-date">{fill(wordsFor(ctx.shop.shopLanguage).drops, { when: dropLineIN(at) })}</p>
    }
    case 'group': return <div className="store-b-group">{n.children.map((c) => <BlockNode key={c.id} n={c} href={href} sid={sid} cols={cols} ctx={ctx} video={video} />)}</div>
    case 'columns': return (
      <div className="store-b-cols" data-cols={n.children.length} data-phone={n.phone}>
        {n.children.map((c) => <div key={c.id} className="store-b-col"><BlockNode n={c} href={href} sid={sid} cols={n.children.length} ctx={ctx} video={video} /></div>)}
      </div>
    )
    default: return n satisfies never
  }
}

/** A design section: nothing at all when nothing in it may show (every block empty on the shop). */
export function DesignSection({ s, ctx }: { s: SectionOf<'design'>; ctx: SectionCtx }) {
  const ds = ctx.theme.designs
  const d = ds && Object.hasOwn(ds, s.design) ? ds[s.design]! : null
  if (!d) return null
  const nodes = resolveDesign(d, s.fill, ctx.preview && ctx.examples ? 'preview' : 'shop', !!ctx.lead)
  if (!nodes.length) return null
  const first = (ns: RNode[]): RNode | undefined => { for (const n of ns) { if (n.kind === 'heading') return n; if (n.kind === 'group' || n.kind === 'columns') { const f = first(n.children); if (f) return f } } }
  const h = first(nodes)
  return (
    <section aria-labelledby={h ? `${s.id}-${h.id}` : undefined} className={`${wrap} ${pad} store-b-design`} data-design={d.id}>
      <Label text={s.label} />
      {nodes.map((n) => <BlockNode key={n.id} n={n} href={ctx.href} sid={s.id} cols={1} ctx={ctx} video={s.video?.id} />)}
    </section>
  )
}

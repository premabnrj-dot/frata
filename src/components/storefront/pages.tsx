import { waLink } from '@/domains/settings/whatsapp'
import Link from 'next/link'
import type { PolicyPage } from '@/domains/policies/render'
import { shopJsonLd, websiteJsonLd } from '@/domains/seo/defaults'
import { inCollection, isListed, pageOf } from '@/domains/storefront/listing'
import { classicFromSettings } from '@/domains/themes/resolve'
import type { ResolvedTheme, ThemeSettings } from '@/domains/themes/types'
import type { StoreCatalogue, StoreCollection, StoreShop } from '@/lib/queries/storefront'
import type { LookVideos } from '@/lib/themes/page-look'
import { ProductGrid } from './card'
import { JsonLd } from './json-ld'
import { Photo } from './photo'
import { fill, wordsFor, type Lang } from './words'
import { Sections } from './sections'
import { PolicyBody, POLICY_TITLE } from './policy'
import type { Href } from './shell'

const wrap = 'mx-auto max-w-6xl px-4 sm:px-6'

/** Home: the shop's theme's sections, then the shop's structured data. T0: Classic from the shop's settings. */
export function HomeView({ shop, cat, href, now, theme, bestSellers, videos, preview = false, examples = false }: { shop: StoreShop; cat: StoreCatalogue; href: Href; now: Date; theme?: ResolvedTheme; bestSellers?: Partial<Record<30 | 90, string[]>>; videos?: LookVideos; preview?: boolean; examples?: boolean }) {
  const t = theme ?? classicFromSettings(shop.accent, shop.displayFont)
  return (
    <>
      <Sections list={t.home} ctx={{ shop, cat, theme: t, href, now, bestSellers, videos, preview, examples }} />
      <JsonLd data={shopJsonLd({ name: shop.shopName, url: `https://${shop.host}`, logo: shop.logoUrl, sameAs: shop.instagram ? [`https://instagram.com/${shop.instagram.replace(/^@/, '')}`] : [],
        returnDays: shop.returnDays, returnKind: shop.returnKind, shippingFlat: shop.shippingFlat, freeShippingAbove: shop.freeShippingAbove, metroDays: shop.metroDays, restDays: shop.restDays, dispatchDays: shop.dispatchDays })} />
      {!preview && <JsonLd data={websiteJsonLd(shop.shopName, `https://${shop.host}/`)} />}
    </>
  )
}

/** Page n of a list, at its own address (page 1 is the list itself), so every page is cached on its own. */
export const pagePath = (base: string, n: number) => (n <= 1 ? base : `${base}/page/${n}`)

/** Previous · Page n of m · Next, under a list longer than one page. */
function Pager({ page, pages, base, href, lang }: { page: number; pages: number; base: string; href: Href; lang?: Lang }) {
  if (pages <= 1) return null
  const w = wordsFor(lang)
  const link = 'inline-flex min-h-11 items-center rounded-[var(--store-radius)] border border-store-line px-4 hover:bg-store-chip'
  return (
    <nav aria-label={w.pages} className="mt-10 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? <Link className={link} href={href(pagePath(base, page - 1))} rel="prev">{w.prevPage}</Link> : null}
      <span aria-current="page" className="text-store-sub">{fill(w.pageOf, { n: page, m: pages })}</span>
      {page < pages ? <Link className={link} href={href(pagePath(base, page + 1))} rel="next">{w.nextPage}</Link> : null}
    </nav>
  )
}

export function AllView({ cat, href, now, lang, page = 1 }: { cat: StoreCatalogue; href: Href; now: Date; lang?: Lang; page?: number }) {
  const one = pageOf(cat.products.filter((p) => isListed(p, now)), page)
  const w = wordsFor(lang)
  return (
    <section className={`${wrap} py-8`}>
      <h1 className="mb-6 text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{w.shopAll}</h1>
      <ProductGrid products={one.items} href={href} now={now} empty={w.emptyShop} lang={lang} lead />
      <Pager page={one.page} pages={one.pages} base="/products" href={href} lang={lang} />
    </section>
  )
}

export function CollectionView({ c, cat, href, now, top = 'title', lang, page = 1 }: { c: StoreCollection; cat: StoreCatalogue; href: Href; now: Date; top?: ThemeSettings['collectionTop']; lang?: Lang; page?: number }) {
  const all = inCollection(c, cat.products, now)
  const one = pageOf(all, page)
  const items = one.items
  const pager = <Pager page={one.page} pages={one.pages} base={`/collections/${c.handle}`} href={href} lang={lang} />
  const w = wordsFor(lang)
  // Banner (themes T2): the first listed piece's first photo, as the category circles use; none, the title as today.
  const cover = top === 'banner' && page === 1 ? all.find((p) => p.images[0])?.images[0] ?? null : null
  if (cover) return (
    <>
      <div className="relative flex min-h-56 items-end overflow-hidden bg-store-chip sm:min-h-72">
        <Photo p={cover} alt="" sizes="100vw" priority className="absolute inset-0 h-full w-full object-cover" />
        <div className={`${wrap} relative w-full py-6`}>
          <div className="inline-block max-w-prose rounded-[var(--store-radius)] bg-black/60 px-4 py-3 text-white">
            <h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{c.title}</h1>
            {c.description && <p className="mt-1">{c.description}</p>}
          </div>
        </div>
      </div>
      {/* The banner is this page's priority photo: the cards below wait (TS1b: ≤ 2 eager images a page). */}
      <section className={`${wrap} py-8`}><ProductGrid products={items} href={href} now={now} empty={w.emptyCollection} lang={lang} lead={false} />{pager}</section>
    </>
  )
  return (
    <section className={`${wrap} py-8`}>
      <h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{c.title}</h1>
      {c.description && <p className="mt-2 max-w-prose text-store-sub">{c.description}</p>}
      <div className="mt-6"><ProductGrid products={items} href={href} now={now} empty={w.emptyCollection} lang={lang} lead />{pager}</div>
    </section>
  )
}

/** A policy page. Contact (Theme Studio TS1a, board v2) is the shop's Contact page too: the owner's line, Chat on
 *  WhatsApp to the shop's own number, then the business details from Settings (or the owner's rewrite). */
export function PolicyView({ shop, page, contact }: { shop: StoreShop; page: PolicyPage; contact?: { line: string } }) {
  const wa = page === 'contact' ? waLink(shop.whatsapp) : null
  return (
    <article className={`${wrap} max-w-3xl space-y-4 py-10 leading-relaxed`}>
      <h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{POLICY_TITLE[page]}</h1>
      {page === 'contact' && contact?.line && <p className="text-lg text-store-sub">{contact.line}</p>}
      {wa && <p><a className="store-btn inline-flex min-h-11 items-center gap-2 rounded-[var(--store-radius)] bg-store-button px-5 text-sm font-medium text-store-on-button" href={wa} rel="noopener">Chat on WhatsApp</a></p>}
      <PolicyBody page={page} facts={shop} override={Object.hasOwn(shop.overrides, page) ? shop.overrides[page] : null} shopper />
    </article>
  )
}

/** Every page but the policies, until the shop publishes. */
export function OpeningSoon({ shop, href, paused = false }: { shop: StoreShop; href: Href; paused?: boolean }) {
  const w = wordsFor(shop.shopLanguage)
  return (
    <section className={`${wrap} grid min-h-[50vh] place-items-center py-16 text-center`}>
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-store-sub">{paused ? w.opening.paused : w.opening.soon}</p>
        <h1 className="text-4xl sm:text-5xl" style={{ fontFamily: 'var(--store-display)' }}>{shop.shopName}</h1>
        {shop.tagline && <p className="text-lg text-store-sub">{shop.tagline}</p>}
        {!paused && shop.instagram && <p><a className="underline underline-offset-4" href={`https://instagram.com/${shop.instagram.replace(/^@/, '')}`} rel="noopener">{w.opening.follow}</a></p>}
        <p className="pt-4 text-sm"><Link href={href('/policies/contact')} className="underline underline-offset-4">{w.contact}</Link></p>
      </div>
    </section>
  )
}

/** An archived product's page: 404, in words, with the newest pieces below. */
export function GoneView({ title, cat, href, now, lang }: { title: string; cat: StoreCatalogue; href: Href; now: Date; lang?: Lang }) {
  const w = wordsFor(lang)
  return (
    <section className={`${wrap} py-10`}>
      <h1 className="text-2xl" style={{ fontFamily: 'var(--store-display)' }}>{fill(w.gone, { title })}</h1>
      <p className="mt-2 text-store-sub">{w.goneSub}</p>
      <div className="mt-6"><ProductGrid products={cat.products.filter((p) => isListed(p, now)).slice(0, 8)} href={href} now={now} empty={w.emptyShop} lang={lang} lead /></div>
    </section>
  )
}

export function ShopNotFound({ href, lang }: { href: Href; lang?: Lang }) {
  const w = wordsFor(lang)
  return (
    <section className={`${wrap} grid min-h-[40vh] place-items-center py-16 text-center`}>
      <div className="space-y-3"><h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{w.notHere}</h1>
        <p><Link href={href('/products')} className="underline underline-offset-4">{w.seeEverything}</Link></p></div>
    </section>
  )
}

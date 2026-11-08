import Link from 'next/link'
import type { PolicyPage } from '@/domains/policies/render'
import { shopJsonLd } from '@/domains/catalogue/seo'
import { inCollection, isListed } from '@/domains/storefront/listing'
import { classicFromSettings } from '@/domains/themes/resolve'
import type { ResolvedTheme, ThemeSettings } from '@/domains/themes/types'
import type { StoreCatalogue, StoreCollection, StoreShop } from '@/lib/queries/storefront'
import { ProductGrid } from './card'
import { JsonLd } from './json-ld'
import { Photo } from './photo'
import { Sections } from './sections'
import { PolicyBody, POLICY_TITLE } from './policy'
import type { Href } from './shell'

const wrap = 'mx-auto max-w-6xl px-4 sm:px-6'

/** Home: the shop's theme's sections, then the shop's structured data. T0: Classic from the shop's settings. */
export function HomeView({ shop, cat, href, now, theme, bestSellers }: { shop: StoreShop; cat: StoreCatalogue; href: Href; now: Date; theme?: ResolvedTheme; bestSellers?: Partial<Record<30 | 90, string[]>> }) {
  const t = theme ?? classicFromSettings(shop.accent, shop.displayFont)
  return (
    <>
      <Sections list={t.home} ctx={{ shop, cat, theme: t, href, now, bestSellers }} />
      <JsonLd data={shopJsonLd({ name: shop.shopName, url: `https://${shop.host}`, logo: shop.logoUrl, sameAs: shop.instagram ? [`https://instagram.com/${shop.instagram.replace(/^@/, '')}`] : [],
        returnDays: shop.returnDays, returnKind: shop.returnKind, shippingFlat: shop.shippingFlat, freeShippingAbove: shop.freeShippingAbove, metroDays: shop.metroDays, restDays: shop.restDays, dispatchDays: shop.dispatchDays })} />
    </>
  )
}

export function AllView({ cat, href, now }: { cat: StoreCatalogue; href: Href; now: Date }) {
  const listed = cat.products.filter((p) => isListed(p, now))
  return (
    <section className={`${wrap} py-8`}>
      <h1 className="mb-6 text-3xl" style={{ fontFamily: 'var(--store-display)' }}>Shop all</h1>
      <ProductGrid products={listed} href={href} now={now} empty="New pieces are on their way." />
    </section>
  )
}

export function CollectionView({ c, cat, href, now, top = 'title' }: { c: StoreCollection; cat: StoreCatalogue; href: Href; now: Date; top?: ThemeSettings['collectionTop'] }) {
  const items = inCollection(c, cat.products, now)
  // Banner (themes T2): the first listed piece's first photo, as the category circles use; none, the title as today.
  const cover = top === 'banner' ? items.find((p) => p.images[0])?.images[0] ?? null : null
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
      <section className={`${wrap} py-8`}><ProductGrid products={items} href={href} now={now} empty="Nothing here right now. New pieces are on their way." /></section>
    </>
  )
  return (
    <section className={`${wrap} py-8`}>
      <h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{c.title}</h1>
      {c.description && <p className="mt-2 max-w-prose text-store-sub">{c.description}</p>}
      <div className="mt-6"><ProductGrid products={items} href={href} now={now} empty="Nothing here right now. New pieces are on their way." /></div>
    </section>
  )
}

export function PolicyView({ shop, page }: { shop: StoreShop; page: PolicyPage }) {
  return (
    <article className={`${wrap} max-w-3xl space-y-4 py-10 leading-relaxed`}>
      <h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{POLICY_TITLE[page]}</h1>
      <PolicyBody page={page} facts={shop} override={shop.overrides[page]} shopper />
      {page === 'contact' && shop.whatsapp && <p><a className="underline underline-offset-4" href={`https://wa.me/${shop.whatsapp.replace(/\D/g, '')}`} rel="noopener">Message {shop.shopName} on WhatsApp</a></p>}
    </article>
  )
}

/** Every page but the policies, until the shop publishes. */
export function OpeningSoon({ shop, href }: { shop: StoreShop; href: Href }) {
  return (
    <section className={`${wrap} grid min-h-[50vh] place-items-center py-16 text-center`}>
      <div className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-store-sub">Opening soon</p>
        <h1 className="text-4xl sm:text-5xl" style={{ fontFamily: 'var(--store-display)' }}>{shop.shopName}</h1>
        {shop.tagline && <p className="text-lg text-store-sub">{shop.tagline}</p>}
        {shop.instagram && <p><a className="underline underline-offset-4" href={`https://instagram.com/${shop.instagram.replace(/^@/, '')}`} rel="noopener">Follow on Instagram for the launch</a></p>}
        <p className="pt-4 text-sm"><Link href={href('/policies/contact')} className="underline underline-offset-4">Contact</Link></p>
      </div>
    </section>
  )
}

/** An archived product's page: 404, in words, with the newest pieces below. */
export function GoneView({ title, cat, href, now }: { title: string; cat: StoreCatalogue; href: Href; now: Date }) {
  return (
    <section className={`${wrap} py-10`}>
      <h1 className="text-2xl" style={{ fontFamily: 'var(--store-display)' }}>{title} is no longer available</h1>
      <p className="mt-2 text-store-sub">Here is what is new instead.</p>
      <div className="mt-6"><ProductGrid products={cat.products.filter((p) => isListed(p, now)).slice(0, 8)} href={href} now={now} empty="New pieces are on their way." /></div>
    </section>
  )
}

export function ShopNotFound({ href }: { href: Href }) {
  return (
    <section className={`${wrap} grid min-h-[40vh] place-items-center py-16 text-center`}>
      <div className="space-y-3"><h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>This page is not here</h1>
        <p><Link href={href('/products')} className="underline underline-offset-4">See everything in the shop</Link></p></div>
    </section>
  )
}

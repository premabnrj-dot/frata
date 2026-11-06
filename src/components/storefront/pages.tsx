import Link from 'next/link'
import { displayFamily } from '@/components/shop-preview/fonts'
import type { PolicyPage } from '@/domains/policies/render'
import { shopJsonLd } from '@/domains/catalogue/seo'
import { inCollection, isListed } from '@/domains/storefront/listing'
import type { StoreCatalogue, StoreCollection, StoreShop } from '@/lib/queries/storefront'
import { ProductGrid } from './card'
import { JsonLd } from './json-ld'
import { Photo } from './photo'
import { PolicyBody, POLICY_TITLE } from './policy'
import type { Href } from './shell'

const NEW_IN = 24
const wrap = 'mx-auto max-w-6xl px-4 sm:px-6'

export function HomeView({ shop, cat, href, now }: { shop: StoreShop; cat: StoreCatalogue; href: Href; now: Date }) {
  const listed = cat.products.filter((p) => isListed(p, now))
  const tiles = cat.collections.map((c) => ({ c, first: inCollection(c, cat.products, now)[0] })).filter((t) => t.first).slice(0, 6)
  return (
    <>
      <section className={`${wrap} py-10 sm:py-16`}>
        <h1 className="max-w-3xl text-4xl leading-[1.05] sm:text-6xl" style={{ fontFamily: displayFamily(shop.displayFont) }}>{shop.shopName}</h1>
        {shop.tagline && <p className="mt-3 max-w-xl text-lg text-store-sub">{shop.tagline}</p>}
      </section>
      {tiles.length > 0 && (
        <section aria-labelledby="col-h" className={`${wrap} pb-12`}>
          <h2 id="col-h" className="sr-only">Collections</h2>
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
      )}
      <section aria-labelledby="new-h" className={wrap}>
        <div className="mb-4 flex items-baseline justify-between"><h2 id="new-h" className="text-xl">New in</h2>{listed.length > NEW_IN && <Link href={href('/products')} className="text-sm underline underline-offset-4">See all</Link>}</div>
        <ProductGrid products={listed.slice(0, NEW_IN)} href={href} now={now} empty="New pieces are on their way." />
      </section>
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

export function CollectionView({ c, cat, href, now }: { c: StoreCollection; cat: StoreCatalogue; href: Href; now: Date }) {
  return (
    <section className={`${wrap} py-8`}>
      <h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{c.title}</h1>
      {c.description && <p className="mt-2 max-w-prose text-store-sub">{c.description}</p>}
      <div className="mt-6"><ProductGrid products={inCollection(c, cat.products, now)} href={href} now={now} empty="Nothing here right now. New pieces are on their way." /></div>
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

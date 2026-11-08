import { describeAttribute } from '@/domains/catalogue/taxonomy'
import { defaultDescription, defaultTitle, productJsonLd } from '@/domains/catalogue/seo'
import { availability } from '@/domains/catalogue/availability'
import { pick, urlFor } from '@/domains/media/sizes'
import { factsOf, priceOf } from '@/domains/storefront/listing'
import { isColourOption } from '@/domains/storefront/picker'
import type { StoreProduct, StoreShop } from '@/lib/queries/storefront'
import type { ThemeSettings } from '@/domains/themes/types'
import { BuyBox, type OfferLine } from './buy-box'
import { buyWords, fill, wordsFor } from './words'
import { JsonLd } from './json-ld'


/** Details named from the taxonomy (and Frrata's additions), in the merchant's chosen order. */
export function detailsOf(p: Pick<StoreProduct, 'attributes'>): { name: string; value: string }[] {
  return Object.entries(p.attributes).flatMap(([h, ids]) => {
    const a = describeAttribute(h)
    if (!a || h === 'target-gender' || h === 'age-group') return []
    return [{ name: a.name, value: ids.map((id) => a.values.find((v) => v.id === id)?.name ?? '').filter(Boolean).join(', ') }]
  }).filter((d) => d.value)
}

export function productSeo(shop: StoreShop, p: StoreProduct) {
  const ci = p.options.findIndex(isColourOption)
  const colours = ci >= 0 ? p.optionValues[ci] ?? [] : []
  const fabric = detailsOf(p).find((d) => d.name === 'Fabric')?.value ?? null
  return {
    title: p.seoTitle || defaultTitle(p.title, colours, shop.shopName),
    description: p.seoDescription || defaultDescription({ title: p.title, fabric, minPrice: priceOf(p)?.min ?? null, codOn: shop.codOn, returnDays: shop.returnDays, returnKind: shop.returnKind, city: null }),
    url: `https://${shop.host}/products/${p.handle}`,
    image: p.images[0] ? urlFor(p.images[0].base, pick(p.images[0].widths, 1200)) : null,
  }
}

/** The product page (spec § Product page). Server-rendered; the choices are one client island. */
export function ProductView({ shop, p, now, live = false, layout, offers, below }: {
  shop: StoreShop; p: StoreProduct; now: Date; live?: boolean
  /** The theme's product page (T2); absent = today's layout. */
  layout?: Pick<ThemeSettings, 'gallery' | 'details'>
  /** Offers O·2's lines after the price, and what modules put under the page (Reviews, Size and fit): nothing without them. */
  offers?: OfferLine[]; below?: React.ReactNode
}) {
  const seo = productSeo(shop, p)
  const details = detailsOf(p)
  const gender = p.attributes['target-gender']?.[0] ? describeAttribute('target-gender')?.values.find((v) => v.id === p.attributes['target-gender']![0])?.name ?? null : null
  const ci = p.options.findIndex(isColourOption)
  const w = wordsFor(shop.shopLanguage)
  const model = p.modelHeight && p.modelSize ? fill(w.model.both, { h: p.modelHeight, s: p.modelSize }) : p.modelHeight ? fill(w.model.height, { h: p.modelHeight }) : p.modelSize ? fill(w.model.size, { s: p.modelSize }) : null
  const rt = (w.returns as Record<string, string>)[shop.returnKind]
  const ret = rt ? fill(rt, { d: shop.returnDays }) : null
  const notes = [
    fill(w.ships, { d: shop.dispatchDays, days: shop.dispatchDays === 1 ? w.day : w.days, m: shop.metroDays, r: shop.restDays }),
    ...(ret ? [ret] : []),
  ]
  const ld = productJsonLd({
    name: p.title, description: seo.description, url: seo.url, groupId: p.id, brand: shop.shopName, options: p.options, material: details.find((d) => d.name === 'Fabric')?.value ?? null, gender,
    images: p.images.slice(0, 6).map((i) => urlFor(i.base, pick(i.widths, 1200))),
    variants: p.variants.filter((v) => v.price > 0).map((v) => {
      const img = ci >= 0 ? p.images.find((i) => i.optionValue === v.values[ci]) : undefined
      return { sku: v.sku, values: v.values, price: v.price, availability: availability(factsOf(v), now), image: img ? urlFor(img.base, pick(img.widths, 1200)) : null }
    }),
  })
  return (
    <article className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <BuyBox title={p.title} options={p.options} values={p.optionValues} variants={p.variants.map(({ restockedAt: _, ...v }) => v)} colours={p.colours} images={p.images}
        chart={p.sizeChart && p.sizeChart.rows.length ? p.sizeChart : null} model={model} now={now.toISOString()}
        delivery={{ shippingFlat: shop.shippingFlat, freeShippingAbove: shop.freeShippingAbove, codOn: shop.codOn, codMin: shop.codMin, codMax: shop.codMax, codCharge: shop.codCharge }}
        live={live} notes={notes} taxNote={shop.pricesIncludeGst ? w.taxIncluded : w.taxAdded} w={buyWords(shop.shopLanguage)} gallery={layout?.gallery} offers={offers} />
      {layout?.details === 'folded'
        ? <div className="mt-8 max-w-2xl divide-y divide-store-line border-y border-store-line">
            {p.description && <details><summary className="flex min-h-12 cursor-pointer items-center justify-between text-lg font-medium">{w.about}<span aria-hidden="true">+</span></summary>
              <div className="space-y-3 pb-4 leading-relaxed">{p.description.split(/\n{2,}/).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</div></details>}
            {details.length > 0 && <details><summary className="flex min-h-12 cursor-pointer items-center justify-between text-lg font-medium">{w.details}<span aria-hidden="true">+</span></summary>
              <dl className="pb-4 text-sm">{details.map((d) => <div key={d.name} className="flex gap-4 py-2"><dt className="w-32 shrink-0 text-store-sub">{d.name}</dt><dd>{d.value}</dd></div>)}</dl></details>}
          </div>
        : <div className="mt-10 grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-10">
            <div className="max-w-prose space-y-3 leading-relaxed">
              {p.description && <><h2 className="text-lg font-medium">{w.about}</h2>{p.description.split(/\n{2,}/).map((t, i) => <p key={i} className="whitespace-pre-line">{t}</p>)}</>}
            </div>
            {details.length > 0 && (
              <div><h2 className="mb-2 text-lg font-medium">{w.details}</h2>
                <dl className="divide-y divide-store-line border-y border-store-line text-sm">{details.map((d) => <div key={d.name} className="flex gap-4 py-2"><dt className="w-32 shrink-0 text-store-sub">{d.name}</dt><dd>{d.value}</dd></div>)}</dl>
              </div>
            )}
          </div>}
      {below}
      <JsonLd data={ld} />
    </article>
  )
}

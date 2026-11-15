import { bestOffer, statusLabel, type Status } from '@/domains/catalogue/availability'
import { pick, urlFor } from '@/domains/media/sizes'
import { isSizeOption } from '@/domains/storefront/picker'
import type { ProductListRow } from '@/lib/queries/catalogue'
import { sinceIN } from '@/lib/format-date'
import type { Row } from './product-table'

/** What one row shows, worked out here: the browser gets words and numbers, never the variants' facts. */
export function row(r: ProductListRow, now: Date, href: (handle: string) => string = (h) => `/console/products/${h}`): Row {
  const label = statusLabel(r.status as Status, r.publishAt ? new Date(r.publishAt) : null, now)
  const o = r.stock > 0 ? null : bestOffer(r.offers, now)
  const sizeAt = r.options.findIndex(isSizeOption)
  const sizes = sizeAt >= 0 ? r.optionValues[sizeAt]?.length ?? 0 : 0
  return {
    id: r.id, title: r.title, href: href(r.handle), status: label,
    thumb: r.cover ? urlFor(r.cover.base, pick(r.cover.widths, 96)) : null,
    sub: [r.typeName, `edited ${sinceIN(r.updatedAt, now)}`].filter(Boolean).join(' · '),
    minPrice: r.minPrice, maxPrice: r.maxPrice, unpriced: r.unpriced,
    stock: r.stock > 0 ? r.stock : !o || !r.variantCount ? null : o.kind === 'preorder' ? 'Pre-order' : o.kind === 'made_to_order' ? 'Made to order' : 'Sold out',
    sizes: sizes ? `${sizes} size${sizes === 1 ? '' : 's'}` : r.variantCount > 1 ? `${r.variantCount} options` : 'One size',
    swatches: r.swatches,
  }
}

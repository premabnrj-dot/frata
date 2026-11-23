// =============================================================================
// FILE: src/domains/catalogue/readiness.ts — whether a product is ready to show, in the merchant's words. Its own file
// (page weight, 2026-11-23): the product editor's browser code reads it, and product-form.ts's save checks (zod through
// stories.ts, the tax rates, variants) stayed out of the editor's first load only once it moved. product-form.ts
// re-exports it.
// =============================================================================

import { sizeKey } from './size-charts'

export type Readiness = { label: string; ok: boolean }[]

/** A chart with a row for every size the product sells (PR·0: a kids' 2–3 Y went live on an XS–XXL chart). Case and
 *  spaces don't count ("2-3 y" is "2–3 Y"). */
function chartLine(sizes: readonly string[], chart: readonly string[]): Readiness[number] {
  if (!sizes.length) return { label: 'A size chart for its type', ok: true }
  if (!chart.length) return { label: 'A size chart for its type', ok: false }
  const has = new Set(chart.map(sizeKey))
  const missing = sizes.filter((x) => !has.has(sizeKey(x)))
  return missing.length ? { label: `Size chart rows for ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}`, ok: false } : { label: 'A size chart for its type', ok: true }
}

/** What a product needs before shoppers see it — shown as a list, Publish stays off until all are met. */
export function readiness(p: { title: string; photos: number; prices: number[]; anyBuyable: boolean
  /** The product's sizes (its Size option's values; none: no chart asked) and the sizes its type's chart has rows for. */
  sizes: readonly string[]; chartSizes: readonly string[]
  /** A shop that charges GST: false until the product has an HSN with a known rate (or the merchant's own). Absent: not asked. */
  taxReady?: boolean
  /** A beauty or wellness shop: what the pack must say that is still missing (label.ts labelMissing). Absent: not asked. */
  labelMissing?: string[] }): Readiness {
  return [
    ...(p.labelMissing === undefined ? [] : [{ label: p.labelMissing.length ? `Its label: ${p.labelMissing.join(', ')}` : 'Its label details', ok: !p.labelMissing.length }]),
    ...(p.taxReady === undefined ? [] : [{ label: 'Its HSN code', ok: p.taxReady }]),
    { label: 'A name', ok: !!p.title.trim() },
    { label: 'At least one photo', ok: p.photos > 0 },
    { label: 'A price on every size and colour', ok: p.prices.length > 0 && p.prices.every((x) => x > 0) },
    chartLine(p.sizes, p.chartSizes),
    { label: 'Something shoppers can buy (in stock, or taking pre-orders)', ok: p.anyBuyable },
  ]
}

// =============================================================================
// FILE: src/domains/catalogue/first-product.ts
//
// A NEW PRODUCT'S SHAPE FROM ITS NAME: one rule, read by Products' "New product" (createProduct), the first-product
// popup on Home (its size pills, recomputed as the name is typed) and addFirstProduct (which refuses a size outside
// the options). Plan docs/plans/2026-11-23-o2a-setup-card.md O2a·3. Pure.
// =============================================================================

import { kindOf, startSizes, typeFor, type Kind } from './kind'
import { PRESETS, type PresetKey } from './size-charts'
import { sellsSized } from './packs'

export type ProductTypeFacts = { id: string; name: string; chartSizes?: readonly string[] }

/** A type's chart, as stored (product_types.size_chart), down to its sizes in order: the one reading of it that
 *  firstProductShape's callers share (createProduct, addFirstProduct, the popup's read). */
export const chartSizesOf = (chart: { rows?: readonly { size: string }[] } | null | undefined): string[] => (chart?.rows ?? []).map((r) => r.size)

export type FirstProductShape = {
  kind: Kind
  /** Sizes are asked: the store sells something sized and the product is not one size. */
  sized: boolean
  /** The sizes the person may choose: the type's chart, else the kind's starting chart. */
  options: string[]
  /** The sizes pressed to start: the kind's start sizes that are among the options. */
  pressed: string[]
  typeId: string | null
}

/** The starting chart a kind's sizes come from when no type with a chart is found: its own (kids, footwear, one size),
 *  and for clothing the kurta chart that startSizes.sized is drawn from (kind.ts). */
const presetOf = (k: Kind): PresetKey => (k === 'sized' ? 'womens_kurta' : k)

/**
 * An empty name is kind `sized` (no telling word), so the pills show before a name is typed and change as it is
 * typed. `chosen` is the person's own pick of kind (Products' new-product step), else the name's guess.
 */
export function firstProductShape(title: string, types: readonly ProductTypeFacts[], sells: readonly string[], chosen?: Kind): FirstProductShape {
  const kind = chosen ?? kindOf(title)
  const sized = sellsSized(sells) && kind !== 'one_size'
  const typeId = sized || kind === 'one_size' ? typeFor(title, types, undefined, kind) : null
  if (!sized) return { kind, sized, options: [], pressed: [], typeId }
  const chart = types.find((t) => t.id === typeId)?.chartSizes
  const options = chart?.length ? [...chart] : PRESETS[presetOf(kind)].chart.rows.map((r) => r.size)
  return { kind, sized, options, pressed: startSizes[kind].filter((s) => options.includes(s)), typeId }
}

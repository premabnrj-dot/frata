// =============================================================================
// FILE: src/domains/storefront/picker.ts
//
// THE PRODUCT PAGE'S CHOICES: which option is colour and which is size, the
// variant a set of choices names, what each size and colour button says, and
// the choice a variant link (?colour=rust&size=m) opens. Pure.
// =============================================================================

import { optionKind } from '@/domains/catalogue/option-kind'
import { availability, type Availability } from '@/domains/catalogue/availability'
import { factsOf, type ListVariant } from './listing'

export const isColourOption = (name: string) => optionKind(name) === 'colour'
export const isSizeOption = (name: string) => optionKind(name) === 'size'
const slug = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '-')

/** The variant whose values are exactly `picked` (null while a choice is missing). */
export function variantFor<V extends ListVariant>(variants: V[], picked: (string | null)[]): V | null {
  if (picked.some((x) => x === null)) return null
  return variants.find((v) => v.values.every((x, i) => x === picked[i])) ?? null
}

/**
 * The first choice: what the link asks for, if it exists; else the first colour
 * that can be bought; sizes stay unpicked (a pre-picked size hides the one the
 * shopper needs) unless the product has a single size.
 */
export function initialPick(options: string[], values: string[][], variants: ListVariant[], query: Record<string, string>, now: Date): (string | null)[] {
  return options.map((o, i) => {
    const vals = values[i] ?? []
    const asked = query[o.toLowerCase()]
    const hit = asked ? vals.find((v) => slug(v) === asked) : undefined
    if (hit) return hit
    if (vals.length === 1) return vals[0]!
    if (isSizeOption(o)) return null
    const buyable = vals.find((v) => variants.some((x) => x.values[i] === v && availability(factsOf(x), now).canBuy))
    return buyable ?? vals[0] ?? null
  })
}

/** What one option button means with the other choices held: can it be bought, and its availability. */
export function optionState(variants: ListVariant[], picked: (string | null)[], index: number, value: string, now: Date): { canBuy: boolean; availability: Availability | null } {
  const want = picked.map((p, i) => (i === index ? value : p))
  const matching = variants.filter((v) => v.values.every((x, i) => want[i] === null || want[i] === x))
  const a = matching.map((v) => availability(factsOf(v), now))
  const exact = variantFor(variants, want)
  return { canBuy: a.some((x) => x.canBuy), availability: exact ? availability(factsOf(exact), now) : null }
}

/** The query string for a pick (what a shared link opens); empty values left out. */
export function pickQuery(options: string[], picked: (string | null)[]): string {
  const q = options.map((o, i) => (picked[i] ? `${encodeURIComponent(o.toLowerCase())}=${encodeURIComponent(slug(picked[i]!))}` : '')).filter(Boolean).join('&')
  return q ? `?${q}` : ''
}

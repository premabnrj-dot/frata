import { describe, expect, it } from 'vitest'
import { SELL_KEYS, sellsSized, startingHsn } from '../sell-keys'
import { labelAsked, SELL_TILES } from '../packs'
import { presetsFor } from '../starting-charts'
import { sampleSetFor } from '@/lib/themes/sample'
import { renderPolicy } from '@/domains/policies/render'
import { factsFor, LEAD, lines, TODAY } from './sells-today.rows'

// C1 category packs, C1a·1: the table in sells-today.rows.ts, read through today's functions. This file's assertions do
// not change when the registry lands (plan docs/plans/2026-11-23-c1-category-packs.md); only its import paths may.

/** The returns page's first paragraph, whose last sentence is the condition (render.ts, private). */
const returnsLead = (sells: readonly string[]) =>
  renderPolicy('returns', factsFor(sells), (p) => `₹${p / 100}`)[0]!.map((p) => ('text' in p ? p.text : p.value ?? '')).join('')

describe('what a sell list derives today', () => {
  it.each(TODAY)('%j', (sells, hsn, sized, presets, label, sample, returns) => {
    expect(startingHsn(sells)).toBe(hsn)
    expect(sellsSized(sells)).toBe(sized)
    expect(presetsFor(sells as never).map((p) => p.name)).toEqual(presets)
    expect(labelAsked(sells)).toBe(label)
    expect(sampleSetFor(sells)).toBe(sample)
    expect(returnsLead(sells)).toBe(LEAD + lines(returns))
  })
  it('the keys, in the CHECK order', () => {
    expect(SELL_KEYS).toEqual(['women', 'men', 'kids', 'ethnic', 'accessories', 'footwear', 'jewellery', 'beauty', 'wellness'])
  })
  it('the tiles, in sign-up order, with their words', () => {
    expect(SELL_TILES.map((t) => [t.key, t.label])).toEqual([
      ['women', 'Women'], ['men', 'Men'], ['kids', 'Kids'], ['ethnic', 'Ethnic wear'], ['footwear', 'Footwear'],
      ['accessories', 'Bags and accessories'], ['jewellery', 'Jewellery'], ['beauty', 'Beauty and personal care'], ['wellness', 'Wellness'],
    ])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import type { Pack } from '@/domains/catalogue/packs'
import { F, J, S, factsFor, LEAD, lines, TODAY } from '@/domains/catalogue/__tests__/sells-today.rows'

// C1c·1 (plan docs/plans/2026-11-23-c1-category-packs.md; here, not in packs/__tests__, because it renders the schema's CHECK
// and a domain test may not import Drizzle): adding a category is one pack file and one line in the list.
// A fixture pack, defined only here, is appended to the REAL list; the real readers, none of which names it, are then
// imported and must carry it, while every existing store's values stay what they were. No pack ships from this test.
const pet_supplies = {
  key: 'pet_supplies',
  tile: { label: 'Pet supplies', order: 75, icon: 'M5 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM15 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z' },
  startingHsn: { code: '2309', rank: 75 },
  sized: false, charts: ['one_size'], label: true,
  returns: { rank: 25, text: 'Pet food and treats can be returned only unopened.' },
} as const satisfies Pack

vi.mock('@/domains/catalogue/packs/list', async (orig) => {
  const real = await orig<typeof import('@/domains/catalogue/packs/list')>()
  return { PACKS: [...real.PACKS, pet_supplies] }
})

const { SELL_KEYS, SELL_TILES, labelAsked, sellsSized, startingHsn } = await import('@/domains/catalogue/packs')
const { presetsFor } = await import('@/domains/catalogue/starting-charts')
const { renderPolicy } = await import('@/domains/policies/render')
const { SELLS, shopSettings } = await import('@/lib/db/schema')
const { sampleSetFor } = await import('@/lib/themes/sample')

const lead = (sells: readonly string[]) =>
  renderPolicy('returns', factsFor(sells), (p) => `₹${p / 100}`)[0]!.map((p) => ('text' in p ? p.text : p.value ?? '')).join('')

describe('a new pack flows through every reader', () => {
  it('the keys list it last; sign-up’s enum takes it', () => {
    expect(SELL_KEYS.at(-1)).toBe('pet_supplies')
    expect(SELLS).toEqual(SELL_KEYS)
    // The sign-up schema (start/actions.ts) is not exported; it is z.array(z.enum(SELLS)), parsed here over the real SELLS.
    expect(z.array(z.enum(SELLS)).safeParse(['women', 'pet_supplies']).success).toBe(true)
  })
  it('the CHECK the schema renders ends with it', () => {
    const c = getTableConfig(shopSettings).checks.find((x) => x.name === 'shop_settings_sells')!
    expect(new PgDialect().sqlToQuery(c.value).sql).toBe(`"shop_settings"."sells" <@ array['women','men','kids','ethnic','accessories','footwear','jewellery','beauty','wellness','pet_supplies']::text[]`)
  })
  it('its tile takes its place by order', () => {
    expect(SELL_TILES.map((t) => t.key)).toEqual(['women', 'men', 'kids', 'ethnic', 'footwear', 'accessories', 'jewellery', 'pet_supplies', 'beauty', 'wellness'])
  })
  it('its HSN, sizes, charts and label', () => {
    expect(startingHsn(['pet_supplies'])).toBe('2309')
    expect(startingHsn(['pet_supplies', 'jewellery'])).toBe('7117')
    expect(sellsSized(['pet_supplies'])).toBe(false)
    expect(presetsFor(['pet_supplies']).map((p) => p.name)).toEqual(['One size'])
    expect(labelAsked(['pet_supplies'])).toBe(true)
  })
  it('its return line sits between J and S', () => {
    expect(lead(['wellness', 'pet_supplies', 'jewellery'])).toBe(`${LEAD}${J} ${pet_supplies.returns.text} ${S}`)
    expect(lead(['pet_supplies', 'women'])).toBe(`${LEAD}${F} ${pet_supplies.returns.text}`)
  })
  it('no existing store changes', () => {
    for (const [sells, hsn, sized, presets, label, sample, returns] of TODAY) {
      expect(startingHsn(sells), String(sells)).toBe(hsn)
      expect(sellsSized(sells), String(sells)).toBe(sized)
      expect(presetsFor(sells).map((p) => p.name), String(sells)).toEqual(presets)
      expect(labelAsked(sells), String(sells)).toBe(label)
      expect(sampleSetFor(sells), String(sells)).toBe(sample)
      expect(lead(sells), String(sells)).toBe(LEAD + lines(returns))
    }
  })
})

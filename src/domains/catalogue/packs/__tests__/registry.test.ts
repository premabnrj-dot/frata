import { describe, expect, it } from 'vitest'
import { PACKS } from '../list'
import { FALLBACK_HSN, UNSAID } from '../registry'
import { chartKeys, labelAsked, presetsFor, returnLines, SELL_KEYS, SELL_TILES, sellsSized, startingHsn } from '..'
import { PRESETS } from '../../size-charts'
import * as old from '../../sell-keys'
import { presetsFor as oldPresetsFor } from '../../size-charts'
import { labelAsked as oldLabelAsked } from '../../label'
import { renderPolicy } from '@/domains/policies/render'
import { factsFor, LEAD, TODAY } from '../../__tests__/sells-today.rows'

// The category pack registry (plan docs/plans/2026-11-23-c1-category-packs.md, C1a·2): the packs are well formed, and
// each accessor gives what today's functions give.

/** Literal copies of the sign-up tiles' paths (src/app/start/create-shop-form.tsx:251-254 on 2026-11-23, finding 7). */
const ICONS_TODAY = {
  women: 'M9 3h6l1 5-2 1 2 12H8l2-12-2-1z', men: 'M8 3l4 2 4-2 4 4-3 3v11H7V10L4 7z', kids: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 9h8l-1 6h-6zM9 15l-1 6M15 15l1 6',
  ethnic: 'M12 3l3 4-1 3 3 11H7l3-11-1-3z', footwear: 'M3 16c4 0 6-2 8-6l3 3c2 2 4 3 7 3v3H3z', accessories: 'M5 9h14l-1.5 11h-11zM9 9a3 3 0 0 1 6 0',
  jewellery: 'M6 4h12l3 5-9 11L3 9zM3 9h18', beauty: 'M9 3h6v4l2 3v10H7V10l2-3z', wellness: 'M12 21c-5-3-8-7-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 8-8 11z',
}

const unique = (xs: readonly unknown[]) => new Set(xs).size === xs.length

describe('the packs', () => {
  it('keys are unique and shaped for the CHECK', () => {
    expect(unique(PACKS.map((p) => p.key))).toBe(true)
    for (const p of PACKS) expect(p.key).toMatch(/^[a-z][a-z_]{1,23}$/)
    expect(SELL_KEYS).toEqual(PACKS.map((p) => p.key))
  })
  it('tile orders and HSN ranks are each unique', () => {
    expect(unique(PACKS.map((p) => p.tile.order))).toBe(true)
    expect(unique(PACKS.map((p) => p.startingHsn.rank))).toBe(true)
  })
  it('labels are 1 to 30 characters; icons are stroke paths, today’s nine exactly', () => {
    for (const p of PACKS) {
      expect(p.tile.label.length, p.key).toBeGreaterThan(0)
      expect(p.tile.label.length, p.key).toBeLessThanOrEqual(30)
      expect(p.tile.icon, p.key).toMatch(/^[MmLlHhVvCcSsQqAaZz0-9 .,-]+$/)
    }
    expect(Object.fromEntries(PACKS.map((p) => [p.key, p.tile.icon]))).toEqual(ICONS_TODAY)
  })
  it('every chart is a preset; every unsaid key is a pack; HSN codes are 4, 6 or 8 digits', () => {
    for (const p of PACKS) for (const c of p.charts) expect(PRESETS[c], `${p.key} ${c}`).toBeDefined()
    for (const k of UNSAID) expect(SELL_KEYS).toContain(k)
    for (const p of PACKS) expect(p.startingHsn.code, p.key).toMatch(/^\d{4}(\d{2}){0,2}$/)
    expect(FALLBACK_HSN).toMatch(/^\d{4}$/)
  })
  it('tiles come in tile order', () => {
    expect(SELL_TILES.map((t) => t.order)).toEqual([...SELL_TILES.map((t) => t.order)].sort((a, b) => a - b))
    expect(SELL_TILES.map((t) => [t.key, t.label])).toEqual(old.SELL_LABELS)
  })
})

// The bridge: deleted in C1a·3, once the old functions are the registry.
describe('each accessor gives what today’s function gives', () => {
  it.each(TODAY)('%j', (sells) => {
    expect(startingHsn(sells)).toBe(old.startingHsn(sells))
    expect(sellsSized(sells)).toBe(old.sellsSized(sells))
    expect(presetsFor(sells)).toEqual(oldPresetsFor(sells as never))
    expect(chartKeys(sells).map((k) => PRESETS[k])).toEqual(oldPresetsFor(sells as never))
    expect(labelAsked(sells)).toBe(oldLabelAsked(sells))
    const lead = renderPolicy('returns', factsFor(sells), String)[0]!.map((p) => ('text' in p ? p.text : p.value ?? '')).join('')
    expect(LEAD + returnLines(sells).join(' ')).toBe(lead)
  })
})

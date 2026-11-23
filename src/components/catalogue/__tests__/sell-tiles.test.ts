import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SELL_TILES } from '@/domains/catalogue/packs'
import { SellTiles } from '../sell-tiles'

// Sign-up's "What do you sell?" tiles read the category packs (plan docs/plans/2026-11-23-c1-category-packs.md, C1a·6):
// nine buttons, in tile order, each with its words and its line drawing, pressed when chosen. Nothing a person sees
// changed from the tiles O1·8 drew (the words and order are pinned by sells-today.test.ts, the paths by registry.test.ts).

const render = (value: string[]) =>
  renderToStaticMarkup(createElement(SellTiles, { tiles: SELL_TILES, value, onChange: () => {} }))

const buttons = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*><svg[^>]*><path d="([^"]*)"><\/path><\/svg>([^<]*)<\/button>/g)]
    .map(([, pressed, d, label]) => ({ pressed: pressed === 'true', d, label }))

describe('SellTiles', () => {
  it('draws nine buttons in tile order with their words and paths', () => {
    const got = buttons(render([]))
    expect(got).toHaveLength(9)
    expect(got.map((b) => b.label)).toEqual(['Women', 'Men', 'Kids', 'Ethnic wear', 'Footwear', 'Bags and accessories', 'Jewellery', 'Beauty and personal care', 'Wellness'])
    expect(got.map((b) => b.d)).toEqual(SELL_TILES.map((t) => t.icon))
    expect(got.every((b) => !b.pressed)).toBe(true)
  })
  it('presses the chosen tiles only', () => {
    const got = buttons(render(['men', 'beauty']))
    expect(got.filter((b) => b.pressed).map((b) => b.label)).toEqual(['Men', 'Beauty and personal care'])
  })
  it('keeps the group label and the tile class the sign-up stylesheet reads', () => {
    const html = render([])
    expect(html).toContain('<div class="su-tiles" role="group" aria-label="What you sell">')
    expect(html.match(/class="su-tile"/g)).toHaveLength(9)
  })
})

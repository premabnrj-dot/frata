import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { BRAND_CSS } from '../brand-css'

// The brand frame's rules travel inline on every code-site checkout, bag-link, order and policy page, twice (the HTML and
// the RSC payload): a ceiling, and every rule scoped to the frame so the console's preview can't restyle the console.
describe('BRAND_CSS', () => {
  it('stays under 1.6 kB gzipped (1.53 kB on 2026-11-22, with the checkout marks)', () => { expect(gzipSync(BRAND_CSS).length).toBeLessThan(1640) })
  it('scopes every rule under [data-brand]', () => {
    const selectors = BRAND_CSS.replace(/@container[^{]*\{/g, '').split('}').map((r) => r.split('{')[0]!.trim()).filter(Boolean)
    for (const sel of selectors) for (const one of sel.split(',')) expect(one.trim()).toMatch(/^\[data-brand\]/)
  })
})

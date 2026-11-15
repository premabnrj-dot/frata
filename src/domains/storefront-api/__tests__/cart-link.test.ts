import { describe, expect, it } from 'vitest'
import { cartLink, parseCartLink } from '../cart-link'

const A = '8f2c1d3e-1111-4abc-8def-0123456789e1'
const B = '41ab2c3d-2222-4abc-8def-012345678909'

describe('the bag link (SA1b D·1): a frozen grammar', () => {
  it('reads lines in order', () => {
    expect(parseCartLink(`?l=${A}:1,${B}:2`)).toEqual([{ variantId: A, qty: 1 }, { variantId: B, qty: 2 }])
  })
  it('accepts encoded separators and upper-case ids', () => {
    expect(parseCartLink(`?l=${A.toUpperCase()}%3A1%2C${B}%3A2`)).toEqual([{ variantId: A, qty: 1 }, { variantId: B, qty: 2 }])
  })
  it('lowers a quantity over 10 to 10, and sums a size given twice before lowering', () => {
    expect(parseCartLink(`?l=${A}:25`)).toEqual([{ variantId: A, qty: 10 }])
    expect(parseCartLink(`?l=${A}:6,${A}:6`)).toEqual([{ variantId: A, qty: 10 }])
  })
  it('refuses a malformed link whole', () => {
    for (const q of ['', '?l=', `?l=${A}`, `?l=${A}:0`, `?l=${A}:-1`, `?l=${A}:1,javascript:alert(1)`, `?l=${A}:1;${B}:1`, '?l=not-a-uuid-at-all-here-xxxxxxxxxxxx:1', `?l=${A}:1%00`])
      expect(parseCartLink(q)).toBeNull()
  })
  it('refuses more than 20 lines', () => {
    const ids = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect(parseCartLink(`?l=${ids.slice(0, 20).map((x) => `${x}:1`).join(',')}`)).toHaveLength(20)
    expect(parseCartLink(`?l=${ids.map((x) => `${x}:1`).join(',')}`)).toBeNull()
  })
  it('ignores every other parameter', () => {
    expect(parseCartLink(`?utm_source=ig&l=${A}:1&evil=<script>`)).toEqual([{ variantId: A, qty: 1 }])
  })
  it('the builder and the parser agree', () => {
    const url = cartLink('https://checkout.kesarstudio.in/', [{ variantId: A.toUpperCase(), qty: 3 }, { variantId: B, qty: 99 }], { code: 'DIWALI', utm_source: 'instagram' })
    expect(url).toBe(`https://checkout.kesarstudio.in/cart?l=${A}:3,${B}:10&code=DIWALI&utm_source=instagram`)
    expect(parseCartLink(new URL(url).search)).toEqual([{ variantId: A, qty: 3 }, { variantId: B, qty: 10 }])
  })
})

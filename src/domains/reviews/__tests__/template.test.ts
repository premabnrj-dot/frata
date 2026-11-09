import { describe, expect, it } from 'vitest'
import { askComponents, ASK_BODY, firstNameOf, REVIEW_TEMPLATE, STOP_PAYLOAD, templateDefinition } from '../template'

describe('the review ask template (Reviews R1 task 6b)', () => {
  it('is UTILITY, three body parameters, a URL button on the shop and a Stop', () => {
    const d = templateDefinition('kesar-studio.frrata.shop')
    expect(d).toMatchObject({ name: REVIEW_TEMPLATE, category: 'UTILITY', language: 'en' })
    expect(ASK_BODY.match(/\{\{\d\}\}/g)).toEqual(['{{1}}', '{{2}}', '{{3}}'])
    // No offer, coupon or "shop again": a promotion would make it Marketing (H-utility).
    expect(ASK_BODY).not.toMatch(/off|coupon|discount|sale|shop now|₹/i)
    const buttons = (d.components[1] as { buttons: { type: string; url?: string }[] }).buttons
    expect(buttons.map((b) => b.type)).toEqual(['URL', 'QUICK_REPLY'])
    expect(buttons[0]!.url).toBe('https://kesar-studio.frrata.shop/review/{{1}}')
  })
  it('fills the send from one order, cut to fit; the Stop carries its payload', () => {
    const c = askComponents({ firstName: 'Ananya', product: 'x'.repeat(80), shop: 'Kesar Studio', token: 'AbCdEf0123456789xyz' })
    expect(c[0]!.parameters.map((p) => ('text' in p ? p.text : '')).map((t) => t.length)).toEqual([6, 60, 12])
    expect(c[1]!.parameters[0]).toEqual({ type: 'text', text: 'AbCdEf0123456789xyz' })
    expect(c[2]!.parameters[0]).toEqual({ type: 'payload', payload: STOP_PAYLOAD })
    expect(askComponents({ firstName: '', product: 'Kurta', shop: 'K', token: 't' })[0]!.parameters[0]).toEqual({ type: 'text', text: 'there' })
  })
  it('first name from what the shopper typed', () => {
    expect([firstNameOf('ananya sharma'), firstNameOf('  Priya  '), firstNameOf('')]).toEqual(['Ananya', 'Priya', ''])
  })
})

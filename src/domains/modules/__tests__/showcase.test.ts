import { describe, expect, it } from 'vitest'
import { MODULE_KEYS } from '../registry'
import { SHOWCASE } from '../showcase'

describe('every app has a page worth showing', () => {
  for (const k of MODULE_KEYS) {
    const s = SHOWCASE[k]
    it(`${k}: a headline, 1–3 features, ≤ 3 questions, what it uses`, () => {
      expect(s.headline.length).toBeGreaterThan(10)
      expect(s.headline.length).toBeLessThanOrEqual(90)
      expect(s.features.length).toBeGreaterThanOrEqual(1)
      expect(s.features.length).toBeLessThanOrEqual(3)
      expect(s.questions.length).toBeLessThanOrEqual(3)
      expect(s.uses.length).toBeGreaterThan(0)
      for (const f of s.features) { expect(f.title.length).toBeLessThanOrEqual(60); expect(f.line.length).toBeLessThanOrEqual(90) }
    })
  }
  it('no third-party price in the copy (architecture review A6)', () => {
    const text = JSON.stringify(SHOWCASE)
    expect(text).not.toMatch(/₹0\.\d|paise|per message/i)
  })
})

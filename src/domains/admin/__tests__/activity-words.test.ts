import { describe, expect, it } from 'vitest'
import { ACTIVITY_KINDS, actionWords } from '../activity-words'

describe('actionWords', () => {
  it('says a known action in words', () => {
    expect(actionWords('module.trial')).toBe('gave an app trial')
    expect(actionWords('billing.refund')).toBe('recorded a refund')
  })
  it('never shows a raw code: unknown actions read as words, module as app', () => {
    expect(actionWords('order.items_edit')).toBe('order items edit')
    expect(actionWords('module.something_new')).toBe('app something new')
    expect(actionWords('addon.x')).toBe('paid app x')
  })
  it('kinds name first words only (the kind index reads split_part)', () => {
    for (const k of Object.values(ACTIVITY_KINDS)) for (const w of k.words) expect(w).toMatch(/^[a-z]+$/)
  })
})

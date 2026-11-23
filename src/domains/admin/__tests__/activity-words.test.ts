import { describe, expect, it } from 'vitest'
import { ACTIVITY_KINDS, MASTER_ONLY_WORDS, actionWords, visibleKindKeys } from '../activity-words'

describe('actionWords', () => {
  it('says a known action in words', () => {
    expect(actionWords('module.trial')).toBe('gave an app trial')
    expect(actionWords('billing.refund')).toBe('recorded a refund')
  })
  it('never shows a raw code: unknown actions read as words, module as app', () => {
    expect(actionWords('order.something_else')).toBe('order something else')
    expect(actionWords('shop.new_thing')).toBe('store new thing')
    expect(actionWords('module.something_new')).toBe('app something new')
    expect(actionWords('addon.x')).toBe('paid app x')
  })
  it('kinds name first words only (the kind index reads split_part)', () => {
    for (const k of Object.values(ACTIVITY_KINDS)) for (const w of k.words) expect(w).toMatch(/^[a-z]+$/)
  })
})

describe('what only a master admin reads', () => {
  it('money words are master-only: billing, costs and the dollar rate', () => {
    expect([...MASTER_ONLY_WORDS].sort()).toEqual(['billing', 'costs', 'credits'])
  })
  it('support staff are offered no money kind in the filter, a master admin is offered every one', () => {
    const support = visibleKindKeys(false)
    for (const k of ['billing', 'costs', 'rate'] as const) expect(support).not.toContain(k)
    expect(support).toContain('plan')
    expect(visibleKindKeys(true)).toEqual(Object.keys(ACTIVITY_KINDS))
  })
  it('costs and the rate are said in words', () => {
    expect(actionWords('costs.pay')).toBe('marked a cost paid')
    expect(actionWords('credits.rate.set')).toBe('set the dollar rate')
  })
})

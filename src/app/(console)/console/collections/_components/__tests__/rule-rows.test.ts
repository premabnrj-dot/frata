import { describe, expect, it } from 'vitest'
import { ruleErrors, toRules, type Row } from '../rule-rows'

describe('a collection\'s price rules', () => {
  it('a price that does not read is shown on its row, never dropped in silence; an empty row is just empty', () => {
    const rows: Row[] = [
      { field: 'price_below', value: '₹2,000' }, { field: 'price_at_least', value: '1,2,99' }, { field: 'price_below', value: '0' },
      { field: 'price_at_least', value: '' }, { field: 'tag', value: 'Diwali' },
    ]
    expect(ruleErrors(rows)).toEqual({ 'rule:1': 'A price in rupees.', 'rule:2': 'More than ₹0.' })
    expect(toRules(rows)).toEqual([{ field: 'price_below', value: 200000 }, { field: 'tag', value: 'Diwali' }])
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COST_CADENCES, COST_CATEGORIES, COST_CURRENCIES, COST_KINDS } from '@/domains/admin/costs'

// The CHECK lists in drizzle/0172 are frozen text; the engine's tuples are code. They must say the same.
const sql = readFileSync('drizzle/0172_admin_costs.sql', 'utf8')
const listOf = (constraint: string) => {
  const m = new RegExp(`CONSTRAINT "${constraint}" CHECK \\([^\\n]*?in \\(([^)]*)\\)`).exec(sql)
  expect(m, constraint).not.toBeNull()
  return [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1])
}

describe('the Costs CHECK lists in 0172 match the engine tuples', () => {
  it.each([
    ['cost_items_kind', COST_KINDS], ['cost_items_cadence', COST_CADENCES], ['cost_items_category', COST_CATEGORIES],
    ['cost_items_currency', COST_CURRENCIES], ['cost_payments_currency', COST_CURRENCIES],
  ] as const)('%s', (name, tuple) => {
    expect(listOf(name)).toEqual([...tuple])
  })
})

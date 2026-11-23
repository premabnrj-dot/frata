import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CASH_KINDS, CASH_MAX, KIND_DIRECTION } from '@/domains/admin/cash'

// The CHECK list in drizzle/0173 is frozen text; the engine's tuple is code. They must say the same.
const sql = readFileSync('drizzle/0173_admin_cash.sql', 'utf8')

describe('the Cash migration matches the engine', () => {
  it('cash_entries_kind lists exactly the kinds, in order', () => {
    const m = /CONSTRAINT "cash_entries_kind" CHECK \([^\n]*?in \(([^)]*)\)/.exec(sql)
    expect(m).not.toBeNull()
    expect([...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1])).toEqual([...CASH_KINDS])
  })
  it('every kind has a direction, so no direction is stored beside it', () => {
    expect(Object.keys(KIND_DIRECTION)).toHaveLength(CASH_KINDS.length)
    expect(sql).not.toMatch(/"direction"|"status"/)
  })
  it('the amount ceilings are the engine\'s', () => {
    expect(sql).toContain(`between 1 and ${CASH_MAX}`)
    expect(sql).toContain(`between -${CASH_MAX} and ${CASH_MAX}`)
  })
})

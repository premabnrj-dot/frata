import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LIMITS, withinBounds } from '../limits'

// The limits live twice by necessity: DEFAULT_LIMITS here and the seeded ekcode_settings row in drizzle/0088_ekcode.sql
// that the definer enforces. This keeps the two the same (impact review, 2026-11-09).
describe('ekcode_settings seed', () => {
  it('equals DEFAULT_LIMITS and is within bounds', () => {
    const sql = readFileSync('drizzle/0088_ekcode.sql', 'utf8')
    const m = sql.match(/insert into ekcode_settings \(sign_in, limits, reason\) values \(true, '(\{.*?\})'::jsonb/)
    expect(m).not.toBeNull()
    const seeded = JSON.parse(m![1]!)
    expect(seeded).toEqual(DEFAULT_LIMITS)
    expect(withinBounds(seeded)).toBe(true)
  })
})

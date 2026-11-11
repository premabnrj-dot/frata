import { describe, expect, it } from 'vitest'
import { SETTING_VALUES } from '../manifest-schema'
import type { ThemeSettings } from '../types'

// The manifest schema's value lists are the ThemeSettings unions, exactly (impact review: one fact, checked, not copied
// silently). A value added to a type and not to the schema, or the other way round, fails typecheck here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Values = typeof SETTING_VALUES
type Check = { [K in keyof Values]: K extends keyof ThemeSettings ? Same<Values[K][number], ThemeSettings[K]> : false }
// Every key must be `true`: a mismatched key's type is `false`, and an all-true object can't be assigned to it.
const exact: Check = Object.fromEntries(Object.keys(SETTING_VALUES).map((k) => [k, true])) as { [K in keyof Values]: true }

describe('SETTING_VALUES', () => {
  it('lists every value of each ThemeSettings union, exactly (held by the types above)', () => {
    expect(Object.values(exact).every(Boolean)).toBe(true)
  })
})

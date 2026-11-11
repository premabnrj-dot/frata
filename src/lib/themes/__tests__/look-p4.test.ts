import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Theme Studio TS0a (speed review): look.ts runs inside asMember's transaction (Look, Undo, Publish). A cached loader or
// a second withTenant there opens a second connection inside the transaction and can stall a full pool (P4).
describe('look.ts never reaches a cache or a second transaction', () => {
  const src = readFileSync('src/lib/themes/look.ts', 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  it('no shopRevision, shopLook, unstable_cache or withTenant(', () => {
    expect(src).not.toMatch(/shopRevision|shopLook|unstable_cache|withTenant\(/)
  })
})

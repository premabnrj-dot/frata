import { describe, expect, it } from 'vitest'
import { MEMBER_ROLES, seesCosts } from '../roles'

describe('seesCosts', () => {
  it('owners and admins always; a partner only before handover; staff never', () => {
    const table = MEMBER_ROLES.flatMap((role) => [false, true].map((hasOwner) => [role, hasOwner, seesCosts(role, hasOwner)]))
    expect(table).toEqual([
      ['owner', false, true], ['owner', true, true],
      ['admin', false, true], ['admin', true, true],
      ['staff', false, false], ['staff', true, false],
      ['partner', false, true], ['partner', true, false],
    ])
  })
})

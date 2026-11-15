import { describe, expect, it } from 'vitest'
import { partnerCan, partnerRoleOf, PARTNER_ROLES } from '../team'

describe('partner roles (T1c)', () => {
  it('reads a role by name; anything else is no role, never the owner (security review H2)', () => {
    for (const r of PARTNER_ROLES) expect(partnerRoleOf(r)).toBe(r)
    expect(partnerRoleOf('Owner')).toBeNull()
    expect(partnerRoleOf('admin')).toBeNull()
    expect(partnerRoleOf(null)).toBeNull()
  })
  it('a Builder can do nothing the workspace offers but open its stores', () => {
    for (const what of ['manageTeam', 'seeDetails', 'handOver', 'createShop', 'seeClientTerms'] as const) expect(partnerCan('builder', what)).toBe(false)
    expect(partnerCan('lead', 'createShop')).toBe(true)
    expect(partnerCan('lead', 'seeClientTerms')).toBe(false)
    expect(partnerCan('owner', 'seeClientTerms')).toBe(true)
  })
})

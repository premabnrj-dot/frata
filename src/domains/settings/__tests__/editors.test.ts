import { describe, expect, it } from 'vitest'
import { SECTIONS } from '../sections'
import { CAN_MANAGE, MEMBER_ROLES } from '../../tenancy/roles'

describe('who edits each settings section', () => {
  it('every section names its editors; owners and admins always, staff never', () => {
    for (const s of SECTIONS) {
      for (const r of CAN_MANAGE) expect(s.editors).toContain(r)
      expect(s.editors).not.toContain('staff')
      for (const r of s.editors) expect(MEMBER_ROLES).toContain(r)
    }
  })
  it('the shop’s own settings are the partner’s to build (payments keys, address and people live elsewhere)', () => {
    expect(SECTIONS.find((s) => s.key === 'brand')?.editors).toContain('partner')
  })
})

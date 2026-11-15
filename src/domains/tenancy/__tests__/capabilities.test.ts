import { describe, expect, it } from 'vitest'
import {
  ANY_MEMBER, BUILDER_ROLE, CAN_BUILD, CAN_INVITE_ACCOUNTANT, CAN_MANAGE, CAN_SEE_GST, CAN_SET_COSTS, CAPABILITIES,
  CONSOLE_ROLES, holds, MEMBER_ROLES, SHIPPERS, SHOP_ROLES, seesCosts,
} from '../roles'

// ADR-0015 § 6, change control: who holds each capability is pinned here. A change to this snapshot is the review;
// adding a role to a capability that reaches orders, shoppers or costs carries the owner's name and date in roles.ts.
describe('capabilities', () => {
  it('the tuples are exactly what they were before T1c (no one gained or lost access)', () => {
    expect([...ANY_MEMBER]).toEqual(['owner', 'admin', 'staff', 'partner'])
    expect([...CAN_BUILD]).toEqual(['owner', 'admin', 'partner'])
    expect([...SHIPPERS]).toEqual(['owner', 'admin', 'staff'])
    expect([...CONSOLE_ROLES]).toEqual(['owner', 'admin', 'staff', 'partner', 'accountant'])
    expect([...CAN_SEE_GST]).toEqual(['owner', 'admin', 'accountant'])
    expect([...CAN_INVITE_ACCOUNTANT]).toEqual(['owner', 'admin'])
    expect([...CAN_MANAGE]).toEqual(['owner', 'admin'])
    expect([...CAN_SET_COSTS]).toEqual(['owner', 'admin', 'partner'])
    expect([...MEMBER_ROLES]).toEqual(['owner', 'admin', 'staff', 'partner', 'accountant'])
  })

  it('who holds what', () => {
    expect(CAPABILITIES).toMatchInlineSnapshot(`
      {
        "accountant.invite": [
          "owner",
          "admin",
        ],
        "api.manage": [
          "owner",
          "admin",
          "partner",
        ],
        "catalogue.read": [
          "owner",
          "admin",
          "staff",
          "partner",
          "builder",
        ],
        "console.full": [
          "owner",
          "admin",
          "staff",
          "partner",
          "accountant",
        ],
        "console.open": [
          "owner",
          "admin",
          "staff",
          "partner",
          "accountant",
          "builder",
        ],
        "content.write": [
          "owner",
          "admin",
          "partner",
        ],
        "costs.set": [
          "owner",
          "admin",
          "partner",
        ],
        "gst.read": [
          "owner",
          "admin",
          "accountant",
        ],
        "parcels.send": [
          "owner",
          "admin",
          "staff",
        ],
        "preview.read": [
          "owner",
          "admin",
          "staff",
          "partner",
          "builder",
        ],
        "shop.build": [
          "owner",
          "admin",
          "partner",
        ],
        "shop.manage": [
          "owner",
          "admin",
        ],
        "shop.work": [
          "owner",
          "admin",
          "staff",
          "partner",
        ],
      }
    `)
  })

  it('a Builder holds only console.open, catalogue.read and preview.read', () => {
    const held = Object.entries(CAPABILITIES).filter(([, roles]) => (roles as readonly string[]).includes(BUILDER_ROLE)).map(([k]) => k).sort()
    expect(held).toEqual(['catalogue.read', 'console.open', 'preview.read'])
    expect(holds(BUILDER_ROLE, 'shop.work')).toBe(false)
    expect(holds(BUILDER_ROLE, 'catalogue.read')).toBe(true)
    expect(holds('accountant', 'catalogue.read')).toBe(false)
  })

  it('a Builder is a shop role but never a MemberRole a tuple can carry', () => {
    expect(SHOP_ROLES).toContain('builder')
    expect((MEMBER_ROLES as readonly string[]).includes('builder')).toBe(false)
    for (const t of [ANY_MEMBER, CAN_BUILD, SHIPPERS, CONSOLE_ROLES, CAN_SEE_GST, CAN_INVITE_ACCOUNTANT, CAN_MANAGE, CAN_SET_COSTS]) {
      expect((t as readonly string[]).includes('builder')).toBe(false)
    }
  })

  it('seesCosts is unchanged', () => {
    expect(seesCosts('owner', true)).toBe(true)
    expect(seesCosts('partner', false)).toBe(true)
    expect(seesCosts('partner', true)).toBe(false)
    expect(seesCosts('staff', false)).toBe(false)
    expect(seesCosts('accountant', false)).toBe(false)
  })
})

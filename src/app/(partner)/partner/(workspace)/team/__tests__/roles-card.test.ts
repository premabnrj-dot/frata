import { describe, expect, it, vi } from 'vitest'
vi.mock('@/components/layout/section', () => ({ Section: () => null }))
vi.mock('@/components/icons/icon', () => ({ Icon: () => null }))
import { holds } from '@/domains/tenancy/roles'
import { partnerCan } from '@/domains/partners/team'
import { ROWS } from '../roles-card'

// The Roles card says what CAPABILITIES and PARTNER_CAN decide (impact review: one fact, said in words once more, held
// to the rule here). Partner owner and Lead hold the shop role 'partner'; a Builder 'builder'.
const row = (what: string) => ROWS.find((r) => r[0] === what)!
const yes = (c: boolean | string) => c !== false
describe('Roles card', () => {
  it('orders, look and products follow the shop capabilities', () => {
    expect(yes(row('Orders and shoppers')[3])).toBe(holds('builder', 'shop.work'))
    expect(yes(row('Orders and shoppers')[2])).toBe(holds('partner', 'shop.work'))
    expect(yes(row('Look and settings')[3])).toBe(holds('builder', 'shop.build'))
    expect(yes(row('Look and settings')[2])).toBe(holds('partner', 'shop.build'))
    expect(row('Products')[3]).toBe(holds('builder', 'catalogue.read') && !holds('builder', 'shop.work') ? 'View' : 'Edit')
    expect(yes(row('Costs and profit')[3])).toBe(holds('builder', 'costs.set'))
  })
  it('hand over and team follow PARTNER_CAN', () => {
    for (const [i, r] of [[1, 'owner'], [2, 'lead'], [3, 'builder']] as const) {
      expect(yes(row('Hand over')[i])).toBe(partnerCan(r, 'handOver'))
      expect(yes(row('Team')[i])).toBe(partnerCan(r, 'manageTeam'))
    }
  })
})

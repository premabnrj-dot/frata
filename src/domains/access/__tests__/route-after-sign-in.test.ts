import { describe, expect, it } from 'vitest'
import { routeAfterSignIn } from '../route-after-sign-in'

describe('routeAfterSignIn', () => {
  it('sends a person invited to a partner team to Accept, after a waiting store', () => {
    expect(routeAfterSignIn({ isStaff: false, storeCount: 0, teamInvites: 1 })).toBe('/join')
    expect(routeAfterSignIn({ isStaff: false, storeCount: 2, teamInvites: 1, partner: 'approved' })).toBe('/join')
    expect(routeAfterSignIn({ isStaff: false, storeCount: 0, handovers: 1, teamInvites: 1 })).toBe('/handover')
  })
  it('lets staff who also own a store choose', () => {
    expect(routeAfterSignIn({ isStaff: true, storeCount: 1 })).toBe('/choose')
  })
  it('sends staff without a store to Admin', () => {
    expect(routeAfterSignIn({ isStaff: true, storeCount: 0 })).toBe('/admin')
  })
  it('sends a merchant to the console', () => {
    expect(routeAfterSignIn({ isStaff: false, storeCount: 2 })).toBe('/console')
  })
  it('sends someone with no store to create one', () => {
    expect(routeAfterSignIn({ isStaff: false, storeCount: 0 })).toBe('/start')
  })
})

describe('routeAfterSignIn — partners and handovers', () => {
  it('shows a waiting handover before anything else', () => {
    expect(routeAfterSignIn({ isStaff: true, storeCount: 3, handovers: 1, partner: 'approved' })).toBe('/handover')
  })
  it('sends an approved partner to the workspace, even with stores', () => {
    expect(routeAfterSignIn({ isStaff: false, storeCount: 4, partner: 'approved' })).toBe('/partner')
  })
  it('shows an applicant with no store their application', () => {
    expect(routeAfterSignIn({ isStaff: false, storeCount: 0, partner: 'applied' })).toBe('/partners/apply')
    expect(routeAfterSignIn({ isStaff: false, storeCount: 0, partner: 'declined' })).toBe('/partners/apply')
  })
  it('keeps an applicant who owns a shop on their console', () => {
    expect(routeAfterSignIn({ isStaff: false, storeCount: 1, partner: 'applied' })).toBe('/console')
  })
})

describe('partnerStatus', async () => {
  const { partnerStatus } = await import('../route-after-sign-in')
  it('derives from timestamps', () => {
    expect(partnerStatus(null)).toBe('none')
    expect(partnerStatus({ approvedAt: null, declinedAt: null })).toBe('applied')
    expect(partnerStatus({ approvedAt: new Date(), declinedAt: null })).toBe('approved')
    expect(partnerStatus({ approvedAt: null, declinedAt: new Date() })).toBe('declined')
  })
})

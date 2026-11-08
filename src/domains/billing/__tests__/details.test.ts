import { describe, expect, it } from 'vitest'
import { parseBillingDetails, STATE_OPTIONS } from '../details'

const good = { legalName: 'Kesar Studio LLP', gstin: '27aapfu0939f1zv', address: '12 MI Road, Jaipur', stateCode: '', email: 'Accounts@Kesar.in' }

describe('billing details (billing B1)', () => {
  it('takes the State from a valid GSTIN and lowercases the email', () => {
    expect(parseBillingDetails(good)).toEqual({ ok: true, value: { legalName: 'Kesar Studio LLP', gstin: '27AAPFU0939F1ZV', address: '12 MI Road, Jaipur', stateCode: '27', email: 'accounts@kesar.in' } })
  })
  it('refuses a State that disagrees with the GSTIN, a bad GSTIN, and missing fields', () => {
    expect(parseBillingDetails({ ...good, stateCode: '08' })).toMatchObject({ ok: false, errors: { stateCode: expect.stringMatching(/registered in state 27/) } })
    expect(parseBillingDetails({ ...good, gstin: '27AAPFU0939F1ZX' })).toMatchObject({ ok: false, errors: { gstin: expect.any(String) } })
    const r = parseBillingDetails({})
    expect(r.ok === false && Object.keys(r.errors).sort()).toEqual(['address', 'email', 'legalName', 'stateCode'])
  })
  it('without a GSTIN, needs a State from the list', () => {
    expect(parseBillingDetails({ ...good, gstin: '', stateCode: '08' })).toMatchObject({ ok: true, value: { gstin: null, stateCode: '08' } })
    expect(parseBillingDetails({ ...good, gstin: '', stateCode: '99' }).ok).toBe(false)
    expect(STATE_OPTIONS.find(([c]) => c === '08')?.[1]).toBe('Rajasthan (08)')
  })
})

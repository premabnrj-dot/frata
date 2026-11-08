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

describe('billing details refuse what should never print (security review 2026-11-08)', () => {
  it('a hostile megabyte is refused by length before any pattern, in milliseconds', () => {
    const t0 = Date.now()
    const r = parseBillingDetails({ ...good, email: 'a@' + '.'.repeat(1_000_000) + '@' })
    expect(r.ok).toBe(false)
    expect(Date.now() - t0).toBeLessThan(200)
  })
  it('the email pattern is linear even within the cap', async () => {
    const { EMAIL_SHAPE } = await import('@/domains/signup/slug')
    const t0 = Date.now()
    expect(EMAIL_SHAPE.test('a@' + '.'.repeat(100_000) + '@')).toBe(false)
    expect(Date.now() - t0).toBeLessThan(200)
    expect(['riya@kesar.in', 'a.b@c.co.in'].every((e) => EMAIL_SHAPE.test(e))).toBe(true)
    expect(['a@b', 'a@b.c', 'a@@b.in', 'a b@c.in'].some((e) => EMAIL_SHAPE.test(e))).toBe(false)
  })
  it('no web addresses in words printed on the invoice; control and bidi characters removed', () => {
    expect(parseBillingDetails({ ...good, address: 'Pay at https://x.test' }).ok).toBe(false)
    expect(parseBillingDetails({ ...good, legalName: 'www.kesar.in' }).ok).toBe(false)
    expect(parseBillingDetails({ ...good, legalName: 'Kesar\u202e Studio' })).toMatchObject({ ok: true, value: { legalName: 'Kesar Studio' } })
  })
})

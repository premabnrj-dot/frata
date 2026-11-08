import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ TRIAL_CLAIM_SECRET: 'test-secret', FRRATA_WA_PHONE_NUMBER_ID: '', FRRATA_WA_TOKEN: '', FRRATA_WA_SIGNUP_TEMPLATE: '', FRRATA_WA_TEMPLATE_LANG: 'en' }))
vi.mock('@/lib/db/platform', () => ({ signupCodeIssue: vi.fn(), signupCodeVerify: vi.fn() }))
vi.mock('@/lib/meta/graph', () => ({ sendAuthCode: vi.fn() }))

describe('trial claim keys (TR1)', () => {
  it('one key per business, whatever the spelling; never the value', async () => {
    const { claimKey } = await import('../claims')
    expect(claimKey('email', ' Aanya@NoorThreads.test ')!.hmac).toBe(claimKey('email', 'aanya@noorthreads.test')!.hmac)
    expect(claimKey('phone', '+91 98290 43211')!.hmac).toBe(claimKey('phone', '9829043211')!.hmac)
    expect(claimKey('email', 'a@b.test')!.hmac).not.toContain('a@b')
    expect(claimKey('email', 'x@y.test')!.hmac).not.toBe(claimKey('phone', 'x@y.test')!.hmac)
  })
  it('one inbox, one key: no +tag, and Gmail\'s dots and second name', async () => {
    const { claimEmail } = await import('../claims')
    expect(claimEmail('Brand+1@NoorThreads.test')).toBe('brand@noorthreads.test')
    expect(claimEmail('b.rand+trial@googlemail.com')).toBe('brand@gmail.com')
    expect(claimEmail('a.nya@noorthreads.test')).toBe('a.nya@noorthreads.test')
  })
  it('an Indian mobile only; the code step is off until Frrata\'s number is set', async () => {
    const { indianMobile, signupCodeOn } = await import('../signup-code')
    expect(indianMobile('+91 98290 43211')).toBe('9829043211')
    expect(indianMobile('09829043211')).toBe('9829043211')
    expect(indianMobile('5829043211')).toBeNull()
    expect(indianMobile('98290')).toBeNull()
    expect(signupCodeOn()).toBe(false)
  })
})

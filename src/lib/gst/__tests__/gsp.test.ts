import { afterEach, describe, expect, it, vi } from 'vitest'

// The switch: filing is off unless GSP_PROVIDER names a GSP, and the fake is never served in Production.
async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return import('../gsp')
}
afterEach(() => { vi.unstubAllEnvs() })

describe('the GSP switch', () => {
  it('is off when unset; the fake only off Vercel (never a preview: it shares the production database)', async () => {
    expect((await load({ GSP_PROVIDER: '', VERCEL_ENV: '' })).gsp()).toBeNull()
    expect((await load({ GSP_PROVIDER: 'fake', VERCEL_ENV: '' })).gsp()?.name).toBe('Test GSP')
    expect((await load({ GSP_PROVIDER: 'fake', VERCEL_ENV: 'preview' })).gsp()).toBeNull()
    expect((await load({ GSP_PROVIDER: 'fake', VERCEL_ENV: 'production' })).gsp()).toBeNull()
    expect((await load({ GSP_PROVIDER: 'cleartax', VERCEL_ENV: '' })).gsp()).toBeNull()
  })
  it('the fake: OTP, push, the summary read back, file once with the EVC OTP', async () => {
    const g = (await load({ GSP_PROVIDER: 'fake', VERCEL_ENV: '' })).gsp()!
    const o = await g.requestOtp('08ABCDE1234F1Z5', 'kesar')
    if (!o.ok) throw new Error('otp')
    expect(await g.verifyOtp('08ABCDE1234F1Z5', 'kesar', o.txn, '111111')).toEqual({ ok: false, error: 'otp_wrong' })
    const v = await g.verifyOtp('08ABCDE1234F1Z5', 'kesar', o.txn, '575757')
    if (!v.ok) throw new Error('verify')
    expect(await g.summary(v.session, '08ABCDE1234F1Z5', '102026')).toEqual({ ok: false, error: 'not_saved' })
    expect((await g.push(v.session, '08ABCDE1234F1Z5', '102026', { b2cs: [{ txval: 1000, iamt: 0, camt: 25, samt: 25 }] })).ok).toBe(true)
    const s = await g.summary(v.session, '08ABCDE1234F1Z5', '102026')
    expect(s.ok && s.liability).toEqual({ taxable: 100_000, igst: 0, cgst: 2_500, sgst: 2_500, documents: 0 })
    const f = await g.file(v.session, '08ABCDE1234F1Z5', '102026', '575757')
    expect(f.ok && f.arn).toMatch(/^AA08102026[0-9A-F]{6}$/)
    expect(await g.file(v.session, '08ABCDE1234F1Z5', '102026', '575757')).toEqual({ ok: false, error: 'already_filed' })
    expect(await g.push(v.session, '08ABCDE1234F1Z5', '102026', {})).toEqual({ ok: false, error: 'already_filed' })
    expect(await g.push('stolen', '08ABCDE1234F1Z5', '112026', {})).toEqual({ ok: false, error: 'session_expired' })
  })
})

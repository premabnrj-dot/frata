import { beforeEach, describe, expect, it, vi } from 'vitest'

// Partner workspace › Developer's actions (G·3 page; impact review): who reaches the device functions, and what never
// does: a Builder, a person signed out, a code or an answer of the wrong shape, a key id that is not a uuid. The
// definers decide again; these hold the words and keep the calls from being made at all.
const partner = vi.hoisted(() => ({ value: null as unknown }))
const calls = vi.hoisted(() => ({ check: vi.fn(), options: vi.fn(), verify: vi.fn(), del: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'localhost:3077' }) }))
vi.mock('@/lib/auth/require-partner', () => ({ requirePartner: async () => partner.value }))
vi.mock('@/lib/http/client-ip', () => ({ clientIp: async () => '127.0.0.1' }))
vi.mock('@/lib/auth/webauthn', async () => {
  const { z } = await import('zod')
  return { PasskeyResponse: z.object({ id: z.string().min(16), type: z.literal('public-key') }).passthrough(), passkeySite: () => ({ rpID: 'localhost', origin: 'http://localhost:3077' }) }
})
vi.mock('@/lib/db/device-codes', () => ({ deleteMyComputer: (...a: unknown[]) => calls.del(...a) }))
vi.mock('@/lib/storefront-api/device', () => ({
  checkDeviceCode: (...a: unknown[]) => calls.check(...a),
  giveOptions: (...a: unknown[]) => calls.options(...a),
  giveVerify: (...a: unknown[]) => calls.verify(...a),
}))

const { checkCodeAction, deleteComputerAction, giveOptionsAction, giveVerifyAction } = await import('../actions')
const ok = (role: string) => ({ ok: true, userId: 'u1', email: 'pia@studio.test', sessionId: 's1', stepup: 'h1', partner: { memberRole: role }, confirmedAt: new Date() })
const answer = { id: 'A'.repeat(43), type: 'public-key', response: {} }

describe('Developer actions', () => {
  beforeEach(() => { for (const f of Object.values(calls)) f.mockReset() })

  it('a Builder is refused with its own reason, and nothing is called', async () => {
    partner.value = ok('builder')
    expect(await checkCodeAction('BCDF-GHJK')).toEqual({ ok: false, why: 'builder' })
    expect(await giveOptionsAction('BCDF-GHJK')).toEqual({ ok: false, why: 'builder' })
    expect(await giveVerifyAction('BCDF-GHJK', answer)).toEqual({ ok: false, why: 'builder' })
    expect(calls.check).not.toHaveBeenCalled()
    expect(calls.options).not.toHaveBeenCalled()
    expect(calls.verify).not.toHaveBeenCalled()
  })

  it('signed out: sign in again; a code or an answer of the wrong shape never reaches the device functions', async () => {
    partner.value = { ok: false, reason: 'signed_out', message: 'Sign in' }
    expect(await checkCodeAction('BCDF-GHJK')).toEqual({ ok: false, why: 'sign_in_again' })
    partner.value = ok('lead')
    expect(await checkCodeAction({ code: 'x' })).toEqual({ ok: false, why: 'bad_code' })
    expect(await checkCodeAction('x'.repeat(40))).toEqual({ ok: false, why: 'bad_code' })
    expect(await giveVerifyAction('BCDF-GHJK', { id: 'short' })).toEqual({ ok: false, why: 'not_confirmed' })
    expect(calls.check).not.toHaveBeenCalled()
    expect(calls.verify).not.toHaveBeenCalled()
  })

  it('a Lead reaches them with the session from requirePartner and the network from the request, never the body', async () => {
    partner.value = ok('lead')
    calls.check.mockResolvedValue({ ok: true, look: { store: 'House of Ayuda', startedAt: '', sameNetwork: true, full: false, hasPasskey: true } })
    calls.verify.mockResolvedValue({ ok: false, why: 'full' })
    expect(await checkCodeAction('bcdf ghjk')).toMatchObject({ ok: true, value: { store: 'House of Ayuda' } })
    expect(calls.check).toHaveBeenCalledWith({ userId: 'u1', sessionId: 's1', stepup: 'h1' }, 'bcdf ghjk', '127.0.0.1')
    expect(await giveVerifyAction('BCDF-GHJK', answer)).toEqual({ ok: false, why: 'full' })
  })

  it('Delete key: a uuid only, the person from requirePartner; a failure reads as not deleted', async () => {
    partner.value = ok('owner')
    expect(await deleteComputerAction('not-a-uuid')).toEqual({ ok: false })
    expect(calls.del).not.toHaveBeenCalled()
    const id = '3f8b1c2a-4d5e-4f60-8a7b-9c0d1e2f3a4b'
    calls.del.mockResolvedValueOnce(true)
    expect(await deleteComputerAction(id)).toEqual({ ok: true })
    expect(calls.del).toHaveBeenCalledWith({ userId: 'u1', sessionId: 's1', stepup: 'h1' }, id)
    calls.del.mockRejectedValueOnce(new Error('down'))
    expect(await deleteComputerAction(id)).toEqual({ ok: false })
  })
})

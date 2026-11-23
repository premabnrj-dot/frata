import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The browser half of passkeys (passkeys, simpler P0, impact review): which calls each step makes, and what a closed
// prompt says. The device itself is mocked; the endpoint is a fake fetch that records the ops in order.
const browser = vi.hoisted(() => ({ startAuthentication: vi.fn(), startRegistration: vi.fn() }))
vi.mock('@simplewebauthn/browser', () => browser)

import { NO_PASSKEY_HERE, passkeyClient } from '../passkey-client'

let ops: string[] = []
beforeEach(() => {
  ops = []
  browser.startAuthentication.mockResolvedValue({ id: 'cred', authenticatorAttachment: 'platform' })
  browser.startRegistration.mockResolvedValue({ id: 'new' })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    const { op } = JSON.parse(init.body) as { op: string }
    ops.push(op)
    const value = op === 'add-verify' ? { id: 'k1', name: 'iCloud Keychain' } : op.endsWith('options') ? { challenge: 'c' } : undefined
    return new Response(JSON.stringify({ ok: true, value }), { status: 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('passkeyClient', () => {
  it('Save a passkey on this device: adds once, no second prompt, and names the password manager', async () => {
    const r = await passkeyClient('/admin/passkey').addPasskey('Chrome on Mac', false, false)
    expect(r).toEqual({ ok: true, value: { name: 'iCloud Keychain' } })
    expect(ops).toEqual(['add-options', 'add-verify'])
    expect(browser.startAuthentication).not.toHaveBeenCalled()
  })
  it('a first passkey still confirms with it after adding, so the session is through', async () => {
    await passkeyClient('/partner/passkey').addPasskey('Chrome on Mac')
    expect(ops).toEqual(['add-options', 'add-verify', 'confirm-options', 'confirm-verify'])
  })
  it('a passkey from another device says so (screen 3 is offered)', async () => {
    browser.startAuthentication.mockResolvedValue({ id: 'cred', authenticatorAttachment: 'cross-platform' })
    expect(await passkeyClient('/admin/passkey').confirmPasskey()).toEqual({ ok: true, value: { crossDevice: true } })
  })
  it('a closed prompt is "no passkey here", never sent to the server', async () => {
    browser.startAuthentication.mockRejectedValue(Object.assign(new Error('closed'), { name: 'NotAllowedError' }))
    expect(await passkeyClient('/admin/passkey').confirmPasskey()).toEqual({ ok: false, error: NO_PASSKEY_HERE })
    expect(ops).toEqual(['confirm-options'])
  })
})

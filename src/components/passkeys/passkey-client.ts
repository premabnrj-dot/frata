'use client'

import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

// =============================================================================
// FILE: src/components/passkeys/passkey-client.ts — the browser half of passkeys, for staff (/admin/passkey) and
// partner people (/partner/passkey): asks the endpoint for options, lets the device sign, sends the answer back.
// Errors come back in words a person reads; a prompt closed with no passkey says to try a phone or another device; any
// other failure, or a passkey the server refuses, reads "Not confirmed".
// =============================================================================

export type Done<T = unknown> = { ok: true; value?: T } | { ok: false; error: string }
export type PasskeyEndpoint = '/admin/passkey' | '/partner/passkey'
const NOT_CONFIRMED = 'Not confirmed. Try again, or use your other passkey.'
/** The device's prompt closed without a passkey: cancelled, or this device holds none of this person's passkeys. */
const NO_PASSKEY_HERE = 'No passkey confirmed on this device. Try again and choose to use a phone or another device in the prompt.'

export function passkeyClient(endpoint: PasskeyEndpoint) {
  async function call<T>(op: string, extra: Record<string, unknown> = {}): Promise<Done<T>> {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...extra }) })
      const j = (await r.json().catch(() => ({}))) as { value?: T; error?: string }
      return r.ok ? { ok: true, value: j.value } : { ok: false, error: j.error || 'Something went wrong. Try again.' }
    } catch { return { ok: false, error: 'No connection. Try again.' } }
  }
  /** "Use passkey": the device signs this session's challenge; the server sets the step-up cookie. */
  async function confirmPasskey(): Promise<Done> {
    const o = await call<Parameters<typeof startAuthentication>[0]['optionsJSON']>('confirm-options')
    if (!o.ok || !o.value) return o.ok ? { ok: false, error: NOT_CONFIRMED } : o
    let response
    try { response = await startAuthentication({ optionsJSON: o.value }) } catch (e) { return { ok: false, error: (e as Error)?.name === 'NotAllowedError' ? NO_PASSKEY_HERE : NOT_CONFIRMED } }
    return call('confirm-verify', { response })
  }
  /** "Add passkey", then confirm with it so the session is through. `confirmFirst`: a second device for someone already
   *  in (adding needs a passkey check in the last 5 minutes; security review M2). */
  async function addPasskey(name: string, confirmFirst = false): Promise<Done> {
    if (confirmFirst) { const c = await confirmPasskey(); if (!c.ok) return c }
    const o = await call<Parameters<typeof startRegistration>[0]['optionsJSON']>('add-options')
    if (!o.ok || !o.value) return o.ok ? { ok: false, error: 'Not added. Try again.' } : o
    let response
    try { response = await startRegistration({ optionsJSON: o.value }) } catch { return { ok: false, error: 'Not added. Try again.' } }
    const added = await call('add-verify', { response, name })
    return added.ok ? confirmPasskey() : added
  }
  /** A sensitive step (approve, remove, hand over): a fresh passkey check first, then the step. */
  async function confirmThen<T = unknown>(op: string, extra: Record<string, unknown>): Promise<Done<T>> {
    const c = await confirmPasskey()
    return c.ok ? call<T>(op, extra) : c
  }
  return { call, confirmPasskey, addPasskey, confirmThen, requestCode: () => call<{ code: string; expiresAt: string }>('request') }
}

// Admin's names, unchanged (src/app/(admin)/admin/staff/staff-passkeys.tsx).
const staff = passkeyClient('/admin/passkey')
export const confirmPasskey = staff.confirmPasskey
export const addPasskey = staff.addPasskey
export const requestCode = staff.requestCode
/** Confirms first (approving needs a check in the last 5 minutes), then approves. */
export const approve = (email: string, code: string) => staff.confirmThen('approve', { email, code })
export const removeOne = (passkeyId: string) => staff.confirmThen('remove', { passkeyId })

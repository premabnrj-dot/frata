'use client'

import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

// =============================================================================
// FILE: src/app/(admin)/admin/_components/passkey-client.ts — the browser half of staff passkeys
// (docs/specs/2026-11-12-staff-passkeys.md): asks /admin/passkey for options, lets the device sign, sends the answer
// back. Errors come back in words a person reads; a cancelled or failed device prompt reads "Not confirmed".
// =============================================================================

export type Done<T = unknown> = { ok: true; value?: T } | { ok: false; error: string }
const NOT_CONFIRMED = 'Not confirmed. Try again, or use your other passkey.'

async function call<T>(op: string, extra: Record<string, unknown> = {}): Promise<Done<T>> {
  try {
    const r = await fetch('/admin/passkey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...extra }) })
    const j = (await r.json().catch(() => ({}))) as { value?: T; error?: string }
    return r.ok ? { ok: true, value: j.value } : { ok: false, error: j.error || 'Something went wrong. Try again.' }
  } catch { return { ok: false, error: 'No connection. Try again.' } }
}

/** "Use passkey": the device signs this session's challenge; the server sets the step-up cookie. */
export async function confirmPasskey(): Promise<Done> {
  const o = await call<Parameters<typeof startAuthentication>[0]['optionsJSON']>('confirm-options')
  if (!o.ok || !o.value) return o.ok ? { ok: false, error: NOT_CONFIRMED } : o
  let response
  try { response = await startAuthentication({ optionsJSON: o.value }) } catch { return { ok: false, error: NOT_CONFIRMED } }
  return call('confirm-verify', { response })
}

/** "Add passkey", then confirm with it so the session is through. */
export async function addPasskey(name: string): Promise<Done> {
  const o = await call<Parameters<typeof startRegistration>[0]['optionsJSON']>('add-options')
  if (!o.ok || !o.value) return o.ok ? { ok: false, error: 'Not added. Try again.' } : o
  let response
  try { response = await startRegistration({ optionsJSON: o.value }) } catch { return { ok: false, error: 'Not added. Try again.' } }
  const added = await call('add-verify', { response, name })
  return added.ok ? confirmPasskey() : added
}

export const requestCode = () => call<{ code: string; expiresAt: string }>('request')
/** Confirms first (approving needs a check in the last 5 minutes), then approves. */
export async function approve(email: string, code: string): Promise<Done> {
  const c = await confirmPasskey()
  return c.ok ? call('approve', { email, code }) : c
}
export async function removeOne(passkeyId: string): Promise<Done> {
  const c = await confirmPasskey()
  return c.ok ? call('remove', { passkeyId }) : c
}

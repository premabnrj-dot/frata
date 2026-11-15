'use client'

import { CONFIRM_AGAIN } from '@/domains/partners/passkeys'
import { passkeyClient } from './passkey-client'

// A workspace write that needs a passkey check in the last 5 minutes (invite, stores, remove; drizzle/0128) answers
// CONFIRM_AGAIN when the check is older: the device confirms once, then the same write is sent again. Nothing typed is lost.
const { confirmPasskey } = passkeyClient('/partner/passkey')

export async function freshly<R>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  const r = await fn()
  if ((r as { error?: unknown } | undefined)?.error !== CONFIRM_AGAIN) return r
  const c = await confirmPasskey()
  return c.ok ? fn() : { ok: false, error: c.error }
}

/** The partner side's passkey calls, for the workspace's own screens (Team, Passkeys, Clients). */
export const partnerPasskeys = passkeyClient('/partner/passkey')
